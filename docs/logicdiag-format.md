# logicdiag Format Reference

The `logicdiag` format is a compact text DSL for describing logic gate diagrams.
Each `<script type="text/logicdiag">` block contains one diagram.

See [the demo](demo/index.html) for examples.

---

## Syntax

One declaration per line. Blank lines and lines beginning with `#` are ignored.
Tokens are separated by spaces or tabs. Labels may be quoted with `"..."`.

### Declarations

| Syntax                          | Description                                                       |
|---------------------------------|-------------------------------------------------------------------|
| `input <id> [<init>] ["label"]` | Toggleable input node; init is 0/1/true/false                     |
| `output <id> ["label"]`         | Output pin wired to an existing node                              |
| `<gate-type> <id> <src>...`     | Gate node with one or more input node IDs                         |
| `stage <n>`                     | Layout hint: place following gates in column `n` (integer)        |
| `row <n>`                       | Layout hint: place following nodes at row `n` (decimals accepted) |
| `wire <id> <src> <stage> <row>` | Passthrough routing node at explicit position (decimals accepted) |
| `label "<text>" <stage> <row>`  | Static text placed at the given stage/row position                |

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

A `row <n>` hint sets the vertical row counter. Each node placed after it
occupies row `n`, then `n+1`, `n+2`, etc. A `stage` hint resets the row
counter to 0.

```
stage 1
row 2
not n1 D      # row 2
and g1 D E    # row 3
```

### Wire Nodes

A `wire` node is a named passthrough point with an explicit position. It carries
its source's signal value and influences routing by splitting a connection into
two legs. Use it to avoid wire overlaps in feedback circuits.

Both `<stage>` and `<row>` accept decimals: `0.5` places the node halfway
between two columns/rows.

```
input S
input R

stage 1
nor  Q   Qf R
nor  Qb  S  Q

wire Qf  Qb  0.5  1.5

output Q
output Qb "~Q"
```

`Qf` is positioned at stage 0.5, row 1.5 — between the input column and the
gate column, between the two gates. The feedback path from `Qb` to `Q`'s input
routes through `Qf`, producing two clean diagonal legs instead of one long
overlapping wire.

### Label Nodes

A `label` places a static text string at an arbitrary position. It has no
electrical function and does not participate in simulation. Both `<stage>` and
`<row>` accept decimals.

```
label "Master latch" 2.5 -0.5
label "Slave latch"  6.5 -0.5
```

The text is centred on the given coordinate.
