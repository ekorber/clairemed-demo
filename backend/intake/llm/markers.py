import re

MARKER_RE = re.compile(r"<<STAGE:([a-z_]+)>>|<<COMPLETE>>")
MAX_MARKER_LEN = 24  # longest marker is <<STAGE:...>>; beyond this it's not a marker


class MarkerFilter:
    """Strips protocol markers out of a token stream while passing visible text through.

    Text after a '<' is held back until we can tell whether it starts a marker.
    """

    def __init__(self):
        self._pending = ""
        self.stage = None
        self.complete = False

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
        return "".join(out)

    def finish(self) -> str:
        def repl(match):
            self._apply(match)
            return ""

        out = MARKER_RE.sub(repl, self._pending)
        self._pending = ""
        return out.rstrip()
