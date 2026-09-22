# Recreate GitHub repo with clean history (no Cursor co-author contributors).
# Requires one-time: gh auth refresh -h github.com -s delete_repo
# Run from repo root in PowerShell.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Refreshing GitHub token with delete_repo scope (complete browser login if prompted)..."
gh auth refresh -h github.com -s delete_repo

Write-Host "Deleting remote repo (clears stale contributor graph)..."
gh repo delete ASB131/spotify-self-hosted-clone --yes

Write-Host "Building single clean commit (no .cursor, no co-author trailers)..."
python scripts/make_clean_commit.py

git remote remove origin 2>$null

Write-Host "Creating new public repo and pushing..."
gh repo create spotify-self-hosted-clone --public --source=. --remote=origin --push

Write-Host "Done: https://github.com/ASB131/spotify-self-hosted-clone"
Write-Host "Verify Contributors shows only you (may take a few minutes to update)."
