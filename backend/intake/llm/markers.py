import re

MARKER_RE = re.compile(r"<<STAGE:([a-z_]+)>>|<<COMPLETE>>")
MAX_MARKER_LEN = 24  # longest marker is <<STAGE:...>>; beyond this it's not a marker

DASH_RE = re.compile(r"[ \t]*[—–][ \t]*")
DOUBLE_COMMA_RE = re.compile(r",[ \t]*,")
TRAILING_WS_RE = re.compile(r"[ \t]+$")


def normalise_dashes(text: str) -> str:
    """Replace em and en dashes with commas.

    The system prompt also forbids them, but that rule has regressed twice as the
    prompt grew and safety instructions started competing for the model's attention.
    A prompt is a request; this is a guarantee.
    """
    return DOUBLE_COMMA_RE.sub(",", DASH_RE.sub(", ", text))


class MarkerFilter:
    """Strips protocol markers out of a token stream while passing visible text through.

    Text after a '<' is held back until we can tell whether it starts a marker.
    """

    def __init__(self):
        self._pending = ""
        # Trailing spaces are held back so that a dash arriving in the next chunk can
        # absorb them. Emitting "word " then seeing "— next" would otherwise produce
        # "word , next".
        self._held_ws = ""
        # Last visible character emitted, so a dash converted to a comma at the start of
        # one chunk can be collapsed against a comma that ended the previous one.
        self._last_char = ""
        self.stage = None
        self.complete = False

    def _emit(self, text: str) -> str:
        text = normalise_dashes(text)
        if text[:1] == "," and self._last_char == ",":
            text = text[1:]
        stripped = text.rstrip()
        if stripped:
            self._last_char = stripped[-1]
        return text

    def _apply(self, match):
        if match.group(0) == "<<COMPLETE>>":
            self.complete = True
        else:
            self.stage = match.group(1)

    def feed(self, delta: str) -> str:
        self._pending += delta
        out = []
        while True:
            i = self._pending.find("<")
            if i == -1:
                out.append(self._pending)
                self._pending = ""
                break
            out.append(self._pending[:i])
            self._pending = self._pending[i:]
            if len(self._pending) == 1:
                break  # lone '<' — need more input
            if not self._pending.startswith("<<"):
                out.append("<")
                self._pending = self._pending[1:]
                continue
            match = MARKER_RE.match(self._pending)
            if match:
                self._apply(match)
                self._pending = self._pending[match.end():]
                continue
            if ">>" in self._pending or len(self._pending) > MAX_MARKER_LEN:
                out.append("<<")  # '<<' that isn't a marker
                self._pending = self._pending[2:]
                continue
            break  # possible marker prefix — wait for more input
        visible = self._held_ws + "".join(out)
        self._held_ws = ""
        held = TRAILING_WS_RE.search(visible)
        if held:
            self._held_ws = held.group()
            visible = visible[: held.start()]
        return self._emit(visible)

    def finish(self) -> str:
        def repl(match):
            self._apply(match)
            return ""

        out = MARKER_RE.sub(repl, self._held_ws + self._pending)
        self._pending = ""
        self._held_ws = ""
        return self._emit(out).rstrip()
