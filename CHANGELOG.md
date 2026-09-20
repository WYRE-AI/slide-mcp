# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

Per-version release notes for tagged releases are published on the [GitHub Releases page](https://github.com/WYRE-AI/slide-mcp/releases) - `semantic-release` generates them from commit history at release time.

## [Unreleased]

### Added

- Initial v1 release: 43 read-only, non-credential-exposing tools covering Slide's Accounts, Agents, Alerts, Audits, Backups, Billing, Clients, Devices, Networks, Restores (File/Push/Image/Virtual Machine), Snapshots, and Users resources. Static bearer API token authentication (`Authorization: Bearer <token>`), issued per-account in the Slide Console. See README's Scope section for the full list of deliberately excluded secret-bearing fields and mutating endpoints.
