package data

import (
	"os"
	"path/filepath"
	"testing"
)

// A root with no tracker resolves to data/applications.md, where the Node
// writers create it, even when the root's own basename is "data". A legacy
// flat tracker still wins when it exists.
func TestResolveTrackerPathFreshRootUsesDataLayout(t *testing.T) {
	t.Setenv("CAREER_OPS_TRACKER", "")
	root := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}

	want := filepath.Join(root, "data", "applications.md")
	if got := resolveTrackerPath(root); got != want {
		t.Fatalf("fresh root: got %q, want %q", got, want)
	}

	legacy := filepath.Join(root, "applications.md")
	if err := os.WriteFile(legacy, []byte("# tracker\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := resolveTrackerPath(root); got != legacy {
		t.Fatalf("flat layout: got %q, want %q", got, legacy)
	}
}
