# logicdiag Format Reference

The `logicdiag` format is a compact text DSL for describing logic gate diagrams.
Each `<script type="text/logicdiag">` block contains one diagram.

---

## Syntax

One declaration per line. Blank lines and lines beginning with `#` are ignored.
Tokens are separated by spaces or tabs. Labels may be quoted with `"..."`.

### Declarations

| Syntax                          | Description                                          |
|---------------------------------|------------------------------------------------------|
| `input <id> [<init>] ["label"]` | Toggleable input node; init is 0/1/true/false        |
| `output <id> ["label"]`         | Output pin wired to an existing node                 |
| `<gate-type> <id> <src>...`     | Gate node with one or more input node IDs            |
| `stage <n>`                     | Layout hint: place following gates in column `n`     |

- `<id>` — an identifier for the node (alphanumeric, used to wire nodes together)
- `<src>...` — one or more node IDs that feed into this gate
- `["label"]` — optional display label; if omitted, the node ID is shown

### Gate Types

| Type   | Description                     |
|--------|---------------------------------|
| `not`  | Inverter (1 input)              |
| `buf`  | Buffer (1 input)                |
| `and`  | AND gate                        |
| `or`   | OR gate                         |
| `nand` | NAND gate                       |
| `nor`  | NOR gate                        |
| `xor`  | XOR gate                        |
| `xnor` | XNOR gate                       |

---

## Layout Hints

Inputs are always in column 0. Gates are placed in columns based on `stage`
hints. A gate declared before any `stage` line defaults to stage 1. After a
`stage <n>` line, all subsequent gates belong to column `n` until the next hint.

```
stage 1
not n1 D      # column 1

stage 2
and out n1 E  # column 2
```

---

## Examples

### AND gate

```
input A
input B
and out A B
output out
```

### AND gate with high initial input

```
input A 1
input B
and out A B
output out
```

`A` starts high; `B` starts low.

### D-latch (SR-NAND)

```
input S
input R

stage 1
nand Q  S  Qb
nand Qb R  Q

output Q
output Qb "~Q"
```

Feedback loops are supported. The simulator runs repeated single-pass evaluations
and detects oscillating circuits automatically.

### NOT feedback (oscillator)

```
input EN
not osc osc
output osc
```

A circuit that never stabilizes will animate at the configured tick rate
(default: 1000 ms).

---

## Embedding in org-mode

Load the library once in your org file's HTML header:

```org
#+HTML_HEAD: <script src="/js/logic-diagram.js" defer></script>
```

Then declare each diagram inline:

```org
#+begin_export html
<script type="text/logicdiag">
  input A
  input B
  and out A B
  output out
</script>
#+end_export
```

Browsers with JavaScript disabled silently ignore
`<script type="text/logicdiag">` — no fallback content is shown.

---

## Configuration

The `LogicDiag` global object exposes two settings:

```js
LogicDiag.tickRate        = 1000; // ms between ticks for oscillating circuits
LogicDiag.stabilityChecks = 20;   // max passes before declaring oscillation
```
