# logic-diagram.js

A JavaScript library for rendering and simulating logic gate circuits in the
browser. Circuits are described with a simple text DSL (Domain-Specific
Language) and rendered as interactive SVG diagrams with live signal propagation.

This library was originally written for my article [Understanding latches and
flip-flops](https://8dcc.github.io/hardware/latches-and-flipflops.html).

## Features

- Text-based DSL for describing circuits (inputs, outputs, gates, wires, etc.).
- Supports common gates: AND, OR, NOT, NAND, NOR, XOR, XNOR.
- Handles feedback loops and oscillating circuits.
- Renders SVG diagrams directly in the page, no dependencies.

## Usage

Include the script and write a circuit description:

```html
<script src="logic-diagram.js" defer></script>

<script type="text/logicdiag">
  input A
  input B
  and out A B
  output out "A AND B"
</script>
```

The library finds all `<script type="text/logicdiag">` blocks on page load and
replaces each with a rendered diagram. Input nodes can be clicked to toggle
their values. See [docs/logicdiag-format.md](docs/logicdiag-format.md) for the
full DSL reference.

## Architecture

See [docs/architecture.md](docs/architecture.md) for an overview of the
internal design.

## License

GPLv3 or later. See the source file for the full license header.
