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


def test_em_dash_becomes_a_comma():
    # The prompt forbids dashes too, but that rule regressed twice as the prompt grew,
    # so the filter guarantees it regardless of what the model emits.
    out, _ = run(["Do not wait — get emergency care now."])
    assert out == "Do not wait, get emergency care now."


def test_unspaced_em_dash_becomes_a_comma():
    out, _ = run(["I didn't understand that—could you say it again?"])
    assert out == "I didn't understand that, could you say it again?"


def test_en_dash_becomes_a_comma():
    out, _ = run(["Take it once – twice daily."])
    assert out == "Take it once, twice daily."


def test_dash_split_across_chunks_does_not_strand_a_space():
    # The space arrives in one chunk and the dash in the next; without holding the
    # trailing space back this emits "appointment , get".
    out, _ = run(["Do not wait for your appointment ", "— get care now."])
    assert out == "Do not wait for your appointment, get care now."


def test_dash_next_to_existing_comma_does_not_double_up():
    out, _ = run(["Okay, — and when did it start?"])
    assert out == "Okay, and when did it start?"


def test_ordinary_hyphens_are_untouched():
    out, _ = run(["It is a low-grade fever, 38-39 degrees."])
    assert out == "It is a low-grade fever, 38-39 degrees."


def test_comma_then_dash_across_chunks_does_not_double_up():
    # The comma ends one chunk and the dash opens the next, so the collapse cannot be
    # done within a single chunk. Seen live as "or risk,  I'm only gathering".
    out, _ = run(["I can note that for the doctor,", " — I only gather information."])
    assert out == "I can note that for the doctor, I only gather information."
