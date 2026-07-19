from intake.llm.markers import MarkerFilter


def run(chunks):
    f = MarkerFilter()
    out = "".join(f.feed(c) for c in chunks) + f.finish()
    return out.rstrip(), f  # callers rstrip assembled replies (views do the same)


def test_plain_text_passes_through():
    out, f = run(["Hello ", "Ana!"])
    assert out == "Hello Ana!"
    assert f.stage is None and f.complete is False


def test_stage_marker_stripped_and_captured():
    out, f = run(["What brings you in today?\n", "<<STAGE:complaint>>"])
    assert out == "What brings you in today?"
    assert f.stage == "complaint"


def test_complete_marker_sets_flag():
    out, f = run(["Take care!\n<<STAGE:wrap_up>>\n<<COMPLETE>>"])
    assert out == "Take care!"
    assert f.stage == "wrap_up" and f.complete is True


def test_marker_split_across_chunks():
    out, f = run(["Thanks.\n<<STA", "GE:hist", "ory>>"])
    assert out == "Thanks."
    assert f.stage == "history"


def test_literal_angle_brackets_survive():
    out, f = run(["Is your temperature < 38, or 38 <", "< higher readings?"])
    assert out == "Is your temperature < 38, or 38 << higher readings?"
