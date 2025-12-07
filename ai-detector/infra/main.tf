terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Artifact Registry (Docker)
resource "google_artifact_registry_repository" "ai_detector" {
  location      = var.region
  repository_id = var.repo_name
  description   = "Container repo for ai-detector"
  format        = "DOCKER"
}

# Cloud Run service (fully managed)
resource "google_cloud_run_v2_service" "ai_detector" {
  name     = var.service_name
  location = var.region
  deletion_protection = false

  template {
    containers {
      image = var.image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }
  }

  ingress = "INGRESS_TRAFFIC_ALL"

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Public invoke (remove if you want private)
resource "google_cloud_run_service_iam_member" "public_invoker" {
  project  = google_cloud_run_v2_service.ai_detector.project
  location = google_cloud_run_v2_service.ai_detector.location
  service  = google_cloud_run_v2_service.ai_detector.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
