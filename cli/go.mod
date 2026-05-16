module github.com/netscope/cli

// Bumped from 1.22 → 1.25.10 to clear 22 OSV-flagged Go stdlib CVEs
// (GO-2025-3503/3563/3750/3751, GO-2025-4007..4013, GO-2025-4155/4175,
// GO-2026-4337/4340/4601/4602/4870/4918/4946/4947/4971). 1.25.10 is
// the smallest version that covers every fix on the OSV report; older
// minors leave a subset of GO-2026-4xxx open.
go 1.25.10
