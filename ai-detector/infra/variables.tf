variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  description = "GCP region (e.g. asia-northeast1)"
  default     = "asia-northeast1"
}

variable "repo_name" {
  type        = string
  description = "Artifact Registry repo name"
  default     = "ai-detector"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name"
  default     = "ai-detector"
}

variable "image" {
  type        = string
  description = "Container image (e.g. REGION-docker.pkg.dev/PROJECT/REPO/ai-detector:tag)"
}

variable "max_instances" {
  type        = number
  description = "Max instances for Cloud Run"
  default     = 1
}
