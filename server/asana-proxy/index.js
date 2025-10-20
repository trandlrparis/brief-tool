const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fetch = require('node-fetch');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(express.json({ limit: '10mb' }));

const ASANA_TOKEN = process.env.ASANA_ACCESS_TOKEN;
const ASANA_TEMPLATE_ID = process.env.ASANA_TEMPLATE_ID;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

if (!ASANA_TOKEN) {
  console.warn('Warning: ASANA_ACCESS_TOKEN not set. Asana proxy will fail without it.');
}

const asanaApi = axios.create({
  baseURL: 'https://app.asana.com/api/1.0',
  headers: {
    Authorization: `Bearer ${ASANA_TOKEN}`,
  },
  timeout: 20000,
});

// Helper: duplicate project from template (preferred)
async function duplicateTemplate(templateGid, projectName) {
  // Asana duplicate endpoint
  const url = `/projects/${templateGid}/duplicate`;
  const data = {
    data: {
      name: projectName,
      include: ['notes', 'members', 'sections', 'custom_fields'],
    },
  };
  const resp = await asanaApi.post(url, data);
  return resp.data.data; // contains new project gid
}

async function createSection(projectGid, sectionName) {
  const resp = await asanaApi.post(`/projects/${projectGid}/sections`, {
    data: { name: sectionName },
  });
  return resp.data.data;
}

async function createTask(projectGid, sectionGid, taskName, notes, due_on) {
  // create task then add to project and section
  const resp = await asanaApi.post('/tasks', {
    data: {
      name: taskName,
      notes,
      projects: [projectGid],
      due_on,
    },
  });
  const task = resp.data.data;
  if (sectionGid) {
    await asanaApi.post(`/sections/${sectionGid}/addTask`, { data: { task: task.gid } });
  }
  return task;
}

async function attachFileToTask(taskGid, buffer, filename, contentType) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType });
  const headers = Object.assign({ Authorization: `Bearer ${ASANA_TOKEN}` }, form.getHeaders());
  const resp = await axios.post(`https://app.asana.com/api/1.0/tasks/${taskGid}/attachments`, form, {
    headers,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return resp.data.data;
}

// POST /api/asana/create-project
// Accepts JSON { brief, pdfUrl?, zipUrl?, files? }
app.post('/api/asana/create-project', upload.fields([{ name: 'pdf' }, { name: 'zip' }]), async (req, res) => {
  try {
    const payload = req.body || {};
    // If multipart, multer will provide files in req.files
    const files = req.files || {};

    const brief = typeof payload.brief === 'string' ? JSON.parse(payload.brief) : payload.brief;
    if (!brief) return res.status(400).json({ error: 'Missing brief payload' });

    const client = brief.client || 'Client';
    const projectName = `${client} — Project Brief — ${new Date().toISOString().slice(0,10)}`;

    // 1) Duplicate template if provided, else create a bare project
    let project;
    if (ASANA_TEMPLATE_ID) {
      try {
        project = await duplicateTemplate(ASANA_TEMPLATE_ID, projectName);
      } catch (dupErr) {
        console.warn('Template duplicate failed, will attempt to create project normally', dupErr.message);
      }
    }

    if (!project) {
      // create a simple project (requires workspace or team) - we will try to use the user's default workspace via /workspaces
      const workspaces = await asanaApi.get('/workspaces');
      const ws = workspaces.data.data?.[0];
      if (!ws) throw new Error('No Asana workspace found for token');
      const createResp = await asanaApi.post('/projects', { data: { name: projectName, workspace: ws.gid } });
      project = createResp.data.data;
    }

    const projectGid = project.gid || project.id;

    // 2) Map sections: create missing sections from brief.sections
    const sectionMap = {};
    for (const sec of brief.sections || []) {
      try {
        const secObj = await createSection(projectGid, sec.title);
        sectionMap[sec.id] = secObj.gid;
      } catch (e) {
        console.warn('Failed to create section', sec.title, e.message);
      }
    }

    // 3) Create tasks for questions (one task per Q)
    const taskPromises = [];
    for (const sec of brief.sections || []) {
      const sectionGid = sectionMap[sec.id];
      for (const q of sec.questions || []) {
        const name = `Q${String(q.number).padStart(6,'0')}: ${q.text}`;
        // format answer: if date-like, keep iso; else string
        let notes = '';
        if (q.answer) {
          notes = typeof q.answer === 'string' ? q.answer : JSON.stringify(q.answer);
        }
        // include deep link to app
        const deepLink = `app://brief/${brief.id}#q${q.number}`;
        notes = `${notes}\n\nDeep link: ${deepLink}`;
        // due date heuristics: if question type is date or contains 'date'
        let due_on = null;
        if (q.type === 'date' || /date|due/i.test(q.text)) {
          const d = new Date(q.answer);
          if (!isNaN(d.getTime())) {
            // Asana expects yyyy-mm-dd
            const iso = d.toISOString().slice(0,10);
            due_on = iso;
          }
        }
        taskPromises.push(createTask(projectGid, sectionGid, name, notes, due_on));
      }
    }

    const tasks = await Promise.all(taskPromises);

    // 4) Add Executive Summary pinned task
    const execSummary = brief.ai?.summary || '';
    let execTask = null;
    try {
      execTask = await createTask(projectGid, null, `Executive Summary (AI) — ${client}`, execSummary, null);
      // mark it by adding note header
      await asanaApi.put(`/tasks/${execTask.gid}`, { data: { notes: execSummary } });
    } catch (e) {
      console.warn('failed to create exec task', e.message);
    }

    // 5) Attach files if provided (multipart upload) or fetch remote URLs and attach
    // PDF upload (either file or pull by URL)
    if (files.pdf && files.pdf.length > 0 && tasks.length > 0) {
      try {
        await attachFileToTask(tasks[0].gid, files.pdf[0].buffer, files.pdf[0].originalname, files.pdf[0].mimetype);
      } catch (e) { console.warn('Failed to attach pdf', e.message); }
    } else if (payload.pdfUrl && tasks.length > 0) {
      // fetch remote and upload
      try {
        const r = await fetch(payload.pdfUrl);
        const buf = await r.buffer();
        await attachFileToTask(tasks[0].gid, buf, 'Project_Brief.pdf', r.headers.get('content-type') || 'application/pdf');
      } catch (e) { console.warn('Failed to fetch/attach pdf url', e.message); }
    }

    // ZIP upload
    if (files.zip && files.zip.length > 0 && tasks.length > 0) {
      try { await attachFileToTask(tasks[0].gid, files.zip[0].buffer, files.zip[0].originalname, files.zip[0].mimetype); } catch (e) { console.warn('Failed to attach zip', e.message); }
    } else if (payload.zipUrl && tasks.length > 0) {
      try { const r = await fetch(payload.zipUrl); const buf = await r.buffer(); await attachFileToTask(tasks[0].gid, buf, 'Project_Brief.zip', r.headers.get('content-type') || 'application/zip'); } catch (e) { console.warn('Failed to fetch/attach zip url', e.message); }
    }

    // 6) Return project link
    return res.json({ ok: true, projectGid, projectUrl: `https://app.asana.com/0/${projectGid}` });
  } catch (err) {
    console.error('Asana proxy error', err && err.message);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Asana proxy listening on ${port}`));
