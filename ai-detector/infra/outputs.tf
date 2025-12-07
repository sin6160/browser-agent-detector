output "repository" {
  value = google_artifact_registry_repository.ai_detector.name
}

output "service_url" {
  value = google_cloud_run_v2_service.ai_detector.uri
}
