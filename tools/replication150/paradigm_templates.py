"""Paradigm method templates for replication150 batch generation.

These are product-shaped adaptations of classic designs for pipeline validation.
Method extract can later override timings/trial_n when page evidence exists.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable, Dict, List, Optional


def _base(
    *,
    assignment: str = "within",
    factors: List[dict],
    conditions: List[dict],
    trial_count: int,
    keys: List[str],
    stimulus_ms: int = 1500,
    group_by: Optional[List[str]] = None,
    trial_flow: Optional[List[str]] = None,
    stimulus_kind: str = "text",
    material_status: str = "not_applicable",
    required_assets: Optional[List[str]] = None,
    task_kind: Optional[str] = None,
) -> dict:
    m = {
        "design": {"assignment": assignment, "factors": factors},
        "trial_flow": trial_flow or ["fixation", "stimulus", "response"],
        "timing": {
            "stimulus_ms": {
                "value": stimulus_ms,
                "unit": "ms",
                "status": "known",
                "source": {"page": 0, "quote": "template default; replace with Method extract"},
            }
        },
        "responses": [{"device": "keyboard", "keys": keys}],
        "trial_count": {"value": trial_count, "status": "known"},
        "conditions": conditions,
        "metrics": {"group_by": group_by or [f["name"] for f in factors[:1]]},
        "material_status": material_status,
        "stimulus_kind": stimulus_kind,
    }
    if required_assets:
        m["required_assets"] = required_assets
    if task_kind:
        m["task_kind"] = task_kind
    return m


def fc2(factor: str, a: str, b: str, keys=None, n=48, texts=None):
    keys = keys or ["f", "j"]
    texts = texts or {a: a.upper(), b: b.upper()}
    return _base(
        factors=[{"name": factor, "levels": [a, b]}],
        conditions=[
            {factor: a, "corrAns": keys[0], "text": texts[a]},
            {factor: b, "corrAns": keys[1], "text": texts[b]},
        ],
        trial_count=n,
        keys=keys,
        group_by=[factor],
    )


TEMPLATES: Dict[str, Callable[[], dict]] = {}


def _reg(pid: str):
    def deco(fn):
        TEMPLATES[pid] = fn
        return fn

    return deco


@_reg("cat1_stroop")
def t_stroop():
    return _base(
        factors=[{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        conditions=[
            {"congruency": "congruent", "corrAns": "f", "text": "RED", "color": "red"},
            {"congruency": "congruent", "corrAns": "j", "text": "GREEN", "color": "green"},
            {"congruency": "incongruent", "corrAns": "f", "text": "GREEN", "color": "red"},
            {"congruency": "incongruent", "corrAns": "j", "text": "RED", "color": "green"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["congruency"],
    )


@_reg("cat1_emotional_stroop")
def t_est():
    m = t_stroop()
    for c in m["conditions"]:
        c["valence"] = "negative" if c["congruency"] == "incongruent" else "neutral"
    m["design"]["factors"].append({"name": "valence", "levels": ["neutral", "negative"]})
    return m


@_reg("cat1_posner_cueing")
def t_posner():
    return _base(
        factors=[{"name": "validity", "levels": ["valid", "invalid", "neutral"]}],
        conditions=[
            {"validity": "valid", "corrAns": "f", "text": "L"},
            {"validity": "valid", "corrAns": "j", "text": "R"},
            {"validity": "invalid", "corrAns": "f", "text": "L"},
            {"validity": "invalid", "corrAns": "j", "text": "R"},
            {"validity": "neutral", "corrAns": "f", "text": "L"},
            {"validity": "neutral", "corrAns": "j", "text": "R"},
        ],
        trial_count=60,
        keys=["f", "j"],
        trial_flow=["fixation", "cue", "target", "response"],
        group_by=["validity"],
    )


@_reg("cat1_flanker")
def t_flanker():
    return _base(
        factors=[{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        conditions=[
            {"congruency": "congruent", "corrAns": "left", "text": "<<<<<"},
            {"congruency": "congruent", "corrAns": "right", "text": ">>>>>"},
            {"congruency": "incongruent", "corrAns": "left", "text": ">><>>"},
            {"congruency": "incongruent", "corrAns": "right", "text": "<<><<"},
        ],
        trial_count=48,
        keys=["left", "right"],
        group_by=["congruency"],
    )


@_reg("cat1_simon")
def t_simon():
    return _base(
        factors=[{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        conditions=[
            {"congruency": "congruent", "corrAns": "z", "text": "BLUE", "side": "left"},
            {"congruency": "congruent", "corrAns": "m", "text": "RED", "side": "right"},
            {"congruency": "incongruent", "corrAns": "m", "text": "RED", "side": "left"},
            {"congruency": "incongruent", "corrAns": "z", "text": "BLUE", "side": "right"},
        ],
        trial_count=48,
        keys=["z", "m"],
        group_by=["congruency"],
    )


@_reg("cat1_visual_search")
def t_vsearch():
    return _base(
        factors=[{"name": "targetPresent", "levels": ["present", "absent"]}],
        conditions=[
            {"targetPresent": "present", "corrAns": "j", "text": "T among L"},
            {"targetPresent": "absent", "corrAns": "f", "text": "L only"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["targetPresent"],
    )


@_reg("cat1_attentional_blink")
def t_ab():
    return _base(
        factors=[{"name": "lag", "levels": ["2", "8"]}],
        conditions=[
            {"lag": "2", "corrAns": "j", "text": "T1-T2 lag2"},
            {"lag": "8", "corrAns": "j", "text": "T1-T2 lag8"},
        ],
        trial_count=40,
        keys=["j", "f"],
        trial_flow=["fixation", "rsvp", "response"],
        group_by=["lag"],
    )


@_reg("cat1_navon")
def t_navon():
    return _base(
        factors=[{"name": "level", "levels": ["global", "local"]}],
        conditions=[
            {"level": "global", "corrAns": "f", "text": "H of s"},
            {"level": "local", "corrAns": "j", "text": "S of h"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["level"],
    )


@_reg("cat1_negative_priming")
def t_np():
    return fc2("primeRelation", "ignored_repeat", "control", n=48)


@_reg("cat1_ant")
def t_ant():
    return _base(
        factors=[
            {"name": "cue", "levels": ["none", "center", "spatial"]},
            {"name": "flanker", "levels": ["congruent", "incongruent"]},
        ],
        conditions=[
            {"cue": "none", "flanker": "congruent", "corrAns": "left", "text": "<<<<<"},
            {"cue": "none", "flanker": "incongruent", "corrAns": "right", "text": "<<><<"},
            {"cue": "center", "flanker": "congruent", "corrAns": "right", "text": ">>>>>"},
            {"cue": "center", "flanker": "incongruent", "corrAns": "left", "text": ">><>>"},
            {"cue": "spatial", "flanker": "congruent", "corrAns": "left", "text": "<<<<<"},
            {"cue": "spatial", "flanker": "incongruent", "corrAns": "right", "text": "<<><<"},
        ],
        trial_count=72,
        keys=["left", "right"],
        trial_flow=["fixation", "cue", "target", "response"],
        group_by=["cue", "flanker"],
    )


@_reg("cat1_dot_probe")
def t_dot():
    return _base(
        factors=[{"name": "congruency", "levels": ["congruent", "incongruent"]}],
        conditions=[
            {"congruency": "congruent", "corrAns": "f", "text": "probe@threat"},
            {"congruency": "incongruent", "corrAns": "j", "text": "probe@neutral"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["congruency"],
    )


@_reg("cat1_sternberg")
def t_stern():
    return _base(
        factors=[{"name": "setSize", "levels": ["2", "6"]}, {"name": "probeType", "levels": ["in", "out"]}],
        conditions=[
            {"setSize": "2", "probeType": "in", "corrAns": "j", "text": "2-in"},
            {"setSize": "2", "probeType": "out", "corrAns": "f", "text": "2-out"},
            {"setSize": "6", "probeType": "in", "corrAns": "j", "text": "6-in"},
            {"setSize": "6", "probeType": "out", "corrAns": "f", "text": "6-out"},
        ],
        trial_count=48,
        keys=["f", "j"],
        trial_flow=["fixation", "memory_set", "delay", "probe", "response"],
        group_by=["setSize", "probeType"],
    )


@_reg("cat1_n_back")
def t_nback():
    return _base(
        factors=[{"name": "match", "levels": ["target", "nontarget"]}],
        conditions=[
            {"match": "target", "corrAns": "j", "text": "match"},
            {"match": "nontarget", "corrAns": "f", "text": "nonmatch"},
        ],
        trial_count=60,
        keys=["f", "j"],
        group_by=["match"],
    )


@_reg("cat1_dual_n_back")
def t_dualnb():
    m = t_nback()
    m["design"]["factors"].append({"name": "modality", "levels": ["visual", "auditory"]})
    return m


@_reg("cat1_brown_peterson")
def t_bp():
    return fc2("delay", "short", "long", n=36)


@_reg("cat1_serial_position")
def t_sp():
    return _base(
        factors=[{"name": "position", "levels": ["early", "middle", "late"]}],
        conditions=[
            {"position": "early", "corrAns": "j", "text": "item1"},
            {"position": "middle", "corrAns": "j", "text": "item5"},
            {"position": "late", "corrAns": "j", "text": "item9"},
        ],
        trial_count=36,
        keys=["j"],
        trial_flow=["study", "test", "response"],
        group_by=["position"],
    )


@_reg("cat1_working_memory")
def t_wm():
    return t_stern()


@_reg("cat1_drm")
def t_drm():
    return _base(
        factors=[{"name": "itemType", "levels": ["studied", "critical_lure", "unrelated"]}],
        conditions=[
            {"itemType": "studied", "corrAns": "old", "text": "BED"},
            {"itemType": "critical_lure", "corrAns": "new", "text": "SLEEP"},
            {"itemType": "unrelated", "corrAns": "new", "text": "CHAIR"},
        ],
        trial_count=45,
        keys=["old", "new"],
        trial_flow=["study_list", "test", "response"],
        group_by=["itemType"],
    )


@_reg("cat1_lexical_decision")
def t_ldt():
    return _base(
        factors=[{"name": "lexicality", "levels": ["word", "nonword"]}],
        conditions=[
            {"lexicality": "word", "corrAns": "j", "text": "TABLE"},
            {"lexicality": "nonword", "corrAns": "f", "text": "BLORP"},
        ],
        trial_count=60,
        keys=["f", "j"],
        group_by=["lexicality"],
    )


@_reg("cat1_go_no_go")
def t_gng():
    return _base(
        factors=[{"name": "trialType", "levels": ["go", "nogo"]}],
        conditions=[
            {"trialType": "go", "corrAns": "space", "text": "GO"},
            {"trialType": "go", "corrAns": "space", "text": "GO"},
            {"trialType": "go", "corrAns": "space", "text": "GO"},
            {"trialType": "nogo", "corrAns": "", "text": "X"},
        ],
        trial_count=40,
        keys=["space"],
        group_by=["trialType"],
        task_kind="gonogo",
    )


@_reg("cat1_stop_signal")
def t_sst():
    return _base(
        factors=[{"name": "trialType", "levels": ["go", "stop"]}],
        conditions=[
            {"trialType": "go", "corrAns": "f", "text": "LEFT"},
            {"trialType": "go", "corrAns": "j", "text": "RIGHT"},
            {"trialType": "stop", "corrAns": "", "text": "STOP"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["trialType"],
        task_kind="gonogo",
    )


@_reg("cat1_task_switching")
def t_switch():
    return _base(
        factors=[{"name": "transition", "levels": ["repeat", "switch"]}],
        conditions=[
            {"transition": "repeat", "corrAns": "f", "text": "color-task"},
            {"transition": "switch", "corrAns": "j", "text": "shape-task"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["transition"],
    )


@_reg("cat1_wcst")
def t_wcst():
    return _base(
        factors=[{"name": "rule", "levels": ["color", "shape", "number"]}],
        conditions=[
            {"rule": "color", "corrAns": "1", "text": "match-color"},
            {"rule": "shape", "corrAns": "2", "text": "match-shape"},
            {"rule": "number", "corrAns": "3", "text": "match-number"},
        ],
        trial_count=60,
        keys=["1", "2", "3", "4"],
        group_by=["rule"],
    )


@_reg("cat1_iowa_gambling")
def t_igt():
    return _base(
        factors=[{"name": "deck", "levels": ["A", "B", "C", "D"]}],
        conditions=[
            {"deck": "A", "corrAns": "a", "text": "Deck A"},
            {"deck": "B", "corrAns": "b", "text": "Deck B"},
            {"deck": "C", "corrAns": "c", "text": "Deck C"},
            {"deck": "D", "corrAns": "d", "text": "Deck D"},
        ],
        trial_count=40,
        keys=["a", "b", "c", "d"],
        group_by=["deck"],
    )


@_reg("cat1_mental_rotation")
def t_mrot():
    return _base(
        factors=[{"name": "angle", "levels": ["0", "60", "120"]}, {"name": "same", "levels": ["same", "mirror"]}],
        conditions=[
            {"angle": "0", "same": "same", "corrAns": "j", "text": "0-same"},
            {"angle": "60", "same": "same", "corrAns": "j", "text": "60-same"},
            {"angle": "120", "same": "mirror", "corrAns": "f", "text": "120-mirror"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["angle", "same"],
    )


@_reg("cat1_change_blindness")
def t_cb():
    return fc2("change", "present", "absent", n=32)


@_reg("cat1_mot")
def t_mot():
    return fc2("nTargets", "2", "4", n=32)


@_reg("cat1_vwm_change_detection")
def t_vwm():
    return _base(
        factors=[{"name": "setSize", "levels": ["2", "4", "6"]}, {"name": "change", "levels": ["same", "diff"]}],
        conditions=[
            {"setSize": "2", "change": "same", "corrAns": "s", "text": "2-same"},
            {"setSize": "2", "change": "diff", "corrAns": "d", "text": "2-diff"},
            {"setSize": "4", "change": "same", "corrAns": "s", "text": "4-same"},
            {"setSize": "4", "change": "diff", "corrAns": "d", "text": "4-diff"},
            {"setSize": "6", "change": "same", "corrAns": "s", "text": "6-same"},
            {"setSize": "6", "change": "diff", "corrAns": "d", "text": "6-diff"},
        ],
        trial_count=48,
        keys=["s", "d"],
        trial_flow=["fixation", "sample", "delay", "test", "response"],
        group_by=["setSize", "change"],
    )


@_reg("cat1_corsi_block")
def t_corsi():
    return _base(
        factors=[{"name": "span", "levels": ["3", "5", "7"]}],
        conditions=[
            {"span": "3", "corrAns": "space", "text": "span3"},
            {"span": "5", "corrAns": "space", "text": "span5"},
            {"span": "7", "corrAns": "space", "text": "span7"},
        ],
        trial_count=24,
        keys=["space"],
        group_by=["span"],
    )


@_reg("cat1_fitts_law")
def t_fitts():
    return _base(
        factors=[{"name": "ID", "levels": ["low", "mid", "high"]}],
        conditions=[
            {"ID": "low", "corrAns": "space", "text": "tap-near-wide"},
            {"ID": "mid", "corrAns": "space", "text": "tap-mid"},
            {"ID": "high", "corrAns": "space", "text": "tap-far-narrow"},
        ],
        trial_count=36,
        keys=["space"],
        group_by=["ID"],
    )


@_reg("cat1_srt")
def t_srt():
    return _base(
        factors=[{"name": "trial", "levels": ["go"]}],
        conditions=[{"trial": "go", "corrAns": "space", "text": "+"}],
        trial_count=40,
        keys=["space"],
        group_by=["trial"],
        stimulus_ms=0,
    )


@_reg("cat1_hick_s_law")
def t_hick():
    return _base(
        factors=[{"name": "nAlternatives", "levels": ["2", "4", "8"]}],
        conditions=[
            {"nAlternatives": "2", "corrAns": "1", "text": "2-choice"},
            {"nAlternatives": "4", "corrAns": "2", "text": "4-choice"},
            {"nAlternatives": "8", "corrAns": "3", "text": "8-choice"},
        ],
        trial_count=48,
        keys=["1", "2", "3", "4", "5", "6", "7", "8"],
        group_by=["nAlternatives"],
    )


@_reg("cat1_bart")
def t_bart():
    return _base(
        factors=[{"name": "action", "levels": ["pump", "cash"]}],
        conditions=[
            {"action": "pump", "corrAns": "space", "text": "PUMP"},
            {"action": "cash", "corrAns": "enter", "text": "CASH"},
        ],
        trial_count=30,
        keys=["space", "enter"],
        group_by=["action"],
    )


@_reg("cat1_delay_discounting")
def t_dd():
    return _base(
        factors=[{"name": "delay", "levels": ["now", "later"]}],
        conditions=[
            {"delay": "now", "corrAns": "f", "text": "$10 now"},
            {"delay": "later", "corrAns": "j", "text": "$20 in 30d"},
        ],
        trial_count=40,
        keys=["f", "j"],
        group_by=["delay"],
    )


@_reg("cat1_probability_discounting")
def t_pd():
    return fc2("prob", "sure", "risky", n=40)


@_reg("cat1_cgt")
def t_cgt():
    return fc2("bet", "low", "high", n=40)


@_reg("cat1_iat")
def t_iat():
    return _base(
        factors=[{"name": "blockType", "levels": ["compatible", "incompatible"]}],
        conditions=[
            {"blockType": "compatible", "corrAns": "e", "text": "good/self"},
            {"blockType": "incompatible", "corrAns": "i", "text": "good/other"},
        ],
        trial_count=80,
        keys=["e", "i"],
        group_by=["blockType"],
    )


@_reg("cat1_trust_game")
def t_tg():
    return fc2("role", "send", "return", keys=["f", "j"], n=20)


@_reg("cat1_ultimatum_game")
def t_ug():
    return _base(
        factors=[{"name": "offer", "levels": ["fair", "unfair"]}],
        conditions=[
            {"offer": "fair", "corrAns": "a", "text": "50-50 ACCEPT?"},
            {"offer": "unfair", "corrAns": "r", "text": "90-10 ACCEPT?"},
        ],
        trial_count=24,
        keys=["a", "r"],
        group_by=["offer"],
    )


@_reg("cat1_moral_dilemmas")
def t_moral():
    return fc2("judgment", "utilitarian", "deontological", n=20)


@_reg("cat1_cyberball")
def t_cyber():
    return _base(
        factors=[{"name": "inclusion", "levels": ["include", "exclude"]}],
        conditions=[
            {"inclusion": "include", "corrAns": "space", "text": "ball-to-you"},
            {"inclusion": "exclude", "corrAns": "space", "text": "ball-others"},
        ],
        trial_count=30,
        keys=["space"],
        group_by=["inclusion"],
    )


@_reg("cat1_prisoner_s_dilemma")
def t_pdil():
    return fc2("choice", "cooperate", "defect", n=30)


@_reg("cat1_semantic_priming")
def t_semprime():
    return _base(
        factors=[{"name": "relatedness", "levels": ["related", "unrelated"]}],
        conditions=[
            {"relatedness": "related", "corrAns": "j", "text": "DOCTOR-NURSE"},
            {"relatedness": "unrelated", "corrAns": "j", "text": "DOCTOR-BUTTER"},
        ],
        trial_count=48,
        keys=["f", "j"],
        group_by=["relatedness"],
    )


@_reg("cat1_wason_selection")
def t_wason():
    return _base(
        factors=[{"name": "card", "levels": ["A", "B", "2", "3"]}],
        conditions=[
            {"card": "A", "corrAns": "space", "text": "turn A?"},
            {"card": "B", "corrAns": "space", "text": "turn B?"},
            {"card": "2", "corrAns": "space", "text": "turn 2?"},
            {"card": "3", "corrAns": "space", "text": "turn 3?"},
        ],
        trial_count=16,
        keys=["space"],
        group_by=["card"],
    )


@_reg("cat1_picture_naming")
def t_pname():
    return _base(
        factors=[{"name": "freq", "levels": ["high", "low"]}],
        conditions=[
            {"freq": "high", "corrAns": "space", "text": "DOG"},
            {"freq": "low", "corrAns": "space", "text": "AXE"},
        ],
        trial_count=40,
        keys=["space"],
        group_by=["freq"],
    )


@_reg("cat1_ax_cpt")
def t_ax():
    return _base(
        factors=[{"name": "trialType", "levels": ["AX", "AY", "BX", "BY"]}],
        conditions=[
            {"trialType": "AX", "corrAns": "j", "text": "A-X"},
            {"trialType": "AY", "corrAns": "f", "text": "A-Y"},
            {"trialType": "BX", "corrAns": "f", "text": "B-X"},
            {"trialType": "BY", "corrAns": "f", "text": "B-Y"},
        ],
        trial_count=80,
        keys=["f", "j"],
        trial_flow=["cue", "delay", "probe", "response"],
        group_by=["trialType"],
    )


@_reg("cat1_trail_making")
def t_tmt():
    return _base(
        factors=[{"name": "form", "levels": ["A", "B"]}],
        conditions=[
            {"form": "A", "corrAns": "space", "text": "1-2-3"},
            {"form": "B", "corrAns": "space", "text": "1-A-2-B"},
        ],
        trial_count=2,
        keys=["space"],
        group_by=["form"],
    )


@_reg("cat1_line_bisection")
def t_lb():
    return _base(
        factors=[{"name": "lineLen", "levels": ["short", "long"]}],
        conditions=[
            {"lineLen": "short", "corrAns": "space", "text": "----"},
            {"lineLen": "long", "corrAns": "space", "text": "----------"},
        ],
        trial_count=20,
        keys=["space"],
        group_by=["lineLen"],
    )


@_reg("cat1_sperling_partial_report")
def t_sperling():
    return _base(
        factors=[{"name": "cueDelay", "levels": ["0", "300", "1000"]}],
        conditions=[
            {"cueDelay": "0", "corrAns": "1", "text": "row1"},
            {"cueDelay": "300", "corrAns": "2", "text": "row2"},
            {"cueDelay": "1000", "corrAns": "3", "text": "row3"},
        ],
        trial_count=36,
        keys=["1", "2", "3"],
        group_by=["cueDelay"],
    )


@_reg("cat1_probabilistic_reversal")
def t_prl():
    return _base(
        factors=[{"name": "phase", "levels": ["acquisition", "reversal"]}],
        conditions=[
            {"phase": "acquisition", "corrAns": "f", "text": "A+"},
            {"phase": "reversal", "corrAns": "j", "text": "B+"},
        ],
        trial_count=60,
        keys=["f", "j"],
        group_by=["phase"],
    )


# ---------- Category 2 / 3 helpers ----------

def text_rating(factor="valence", levels=None, n=40):
    levels = levels or ["neg", "neu", "pos"]
    conds = [{factor: lv, "corrAns": str(i + 1), "text": lv} for i, lv in enumerate(levels)]
    return _base(
        factors=[{"name": factor, "levels": levels}],
        conditions=conds,
        trial_count=n,
        keys=[str(i + 1) for i in range(len(levels))],
        group_by=[factor],
    )


def image_task(factor, levels, material_status="ready", asset_glob="assets/*.jpg", n=40, keys=None):
    keys = keys or ["f", "j"]
    conds = []
    for i, lv in enumerate(levels):
        conds.append(
            {
                factor: lv,
                "corrAns": keys[i % len(keys)],
                "text": lv,
                "image": f"stim_{lv}.jpg",
            }
        )
    return _base(
        factors=[{"name": factor, "levels": levels}],
        conditions=conds,
        trial_count=n,
        keys=keys,
        group_by=[factor],
        stimulus_kind="image",
        material_status=material_status,
        required_assets=[asset_glob] if material_status == "ready" else None,
    )


def audio_task(factor, levels, material_status="ready", n=40):
    conds = [
        {factor: lv, "corrAns": "space", "text": lv, "sound": f"stim_{lv}.wav"}
        for lv in levels
    ]
    return _base(
        factors=[{"name": factor, "levels": levels}],
        conditions=conds,
        trial_count=n,
        keys=["space"],
        group_by=[factor],
        stimulus_kind="audio",
        material_status=material_status,
        required_assets=["assets/*.wav"] if material_status == "ready" else None,
    )


def get_method(paper_id: str, row: Optional[dict] = None) -> dict:
    """Return method dict for paper_id; falls back to generic 2AFC."""
    if paper_id in TEMPLATES:
        return deepcopy(TEMPLATES[paper_id]())

    row = row or {}
    label = (row.get("paradigm_label") or paper_id).lower()
    cat = int(row.get("category") or 0)
    mat = row.get("material_status") or "unknown"

    # gated materials → framework_only method
    if mat in {"gated", "licensed", "missing"} and cat in {2, 3}:
        m = fc2("condition", "A", "B", n=20)
        m["material_status"] = mat
        m["stimulus_kind"] = "text"
        m["framework_only"] = True
        return m

    # material-backed cat2
    if "things" in label or "object decoding" in label or "object recognition" in label:
        return image_task("category", ["a", "b"], material_status="ready" if mat == "ready" else mat)
    if "esc" in label or "environmental sound" in label:
        return audio_task("category", ["a", "b", "c"], material_status="ready" if mat == "ready" else mat)
    if "deam" in label or "music emotion" in label:
        return audio_task("valence", ["low", "high"], material_status="ready" if mat == "ready" else mat)
    if any(k in label for k in ("rating", "norms", "panas", "discount")):
        return text_rating()
    if any(k in label for k in ("memory", "drm", "forgetting", "encoding", "recollection")):
        return t_drm()
    if any(k in label for k in ("search", "cueing", "ensemble", "gist")):
        return t_vsearch()
    if any(k in label for k in ("go/no", "stop")):
        return t_gng()
    if "stroop" in label:
        return t_stroop()
    if any(k in label for k in ("illusion", "müller", "ponzo", "ebbinghaus")):
        return fc2("config", "illusion", "control", n=30)
    if any(k in label for k in ("heuristic", "framing", "anchoring", "fallacy", "sunk", "endowment")):
        return fc2("frame", "A", "B", n=24)
    if any(k in label for k in ("conditioning", "learning", "classification")):
        return t_prl()

    # default text 2AFC adaptation
    m = fc2("condition", "A", "B", n=32)
    m["notes"] = f"generic template for {paper_id}"
    return m


def known_template_ids() -> List[str]:
    return sorted(TEMPLATES)
