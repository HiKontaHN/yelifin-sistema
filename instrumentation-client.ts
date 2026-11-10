import posthog from "posthog-js"

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "test" &&
  posthogToken
) {
  posthog.init(posthogToken, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    autocapture: true,
    capture_heatmaps: true,
    capture_performance: {
      web_vitals: true,
    },
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
  })
}
