from tools.replication150.autopilot import smoke_project


class FakeClient:
    def __init__(self, statuses=None):
        self._statuses = list(statuses or ["finished", "finished", "finished"])
        self.posts = []

    def queue_statuses(self, statuses):
        self._statuses = list(statuses)

    def start_run(self, **kwargs):
        self.posts.append(kwargs)
        return {"run_id": f"r{len(self.posts)}", "status": "running"}

    def wait_finished(self, run_id, timeout=1):
        status = self._statuses.pop(0) if self._statuses else "failed"
        return {"run_id": run_id, "status": status}


def test_smoke_requires_three_finished_runs(valid_project):
    client = FakeClient(["finished", "finished", "failed"])
    report = smoke_project(client, valid_project, runs=3)
    assert report["ok"] is False
    assert [r["status"] for r in report["runs"]] == [
        "finished",
        "finished",
        "failed",
    ]


def test_smoke_uses_distinct_sessions(valid_project):
    client = FakeClient()
    report = smoke_project(client, valid_project, runs=3)
    assert [r["session"] for r in report["runs"]] == ["1", "2", "3"]
