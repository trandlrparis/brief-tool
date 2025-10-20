module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // deep indigo/blue taken from your image
        "lr-deep": "#12006A",
        "lr-accent": "#12006A",
        lrwhite: "#ffffff"
      },
      fontFamily: {
        heading: ["Oswald", "ui-sans-serif", "system-ui"],
        body: ["Inter", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};
