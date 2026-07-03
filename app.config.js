// Dynamic config layered on top of app.json. Its only job: let EAS Build supply
// google-services.json via a file-type environment variable (the file is gitignored,
// so the cloud builder never receives it through git).
//
// Locally, GOOGLE_SERVICES_JSON is undefined → falls back to the real file on disk.
// On EAS, the file env var is materialized to a temp path and GOOGLE_SERVICES_JSON
// points at it.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
