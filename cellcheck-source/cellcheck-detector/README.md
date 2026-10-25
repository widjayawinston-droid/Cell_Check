# CellCheck detector interface

DESN2000 battery screening prototype. Buildless static website; no package dependencies.

## Features

- Pre-test swelling, heat, gas, impact and damage inspection. Yes and unsure answers prevent recording; existing holds stay blocked.
- Arduino USB serial acquisition at 115200 baud, with explicit demo mode.
- Expected and actual voltage/current, configured and Arduino-reported resistive load, measured load power, trace and per-sample assessment.
- Local inventory, battery registration, JSON import/export, detailed history and an optional REST inventory adapter.
- Configurable profile and positive live-profile acknowledgement. No automatic safe-to-use classification.

## Run

Serve `dist/` over HTTPS or localhost, for example:

```sh
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. ES modules and Web Serial require a served context, not a file URL. Desktop Chrome or Edge with Web Serial is needed for USB acquisition; the demo and inventory do not require serial support.

Read `dist/integration-guide.html` for the complete wire protocol and API contract. `dist/CellCheckTelemetry.h` formats calibrated sensor readings from an existing sketch; it does not contain sensor, relay or protective control code.

## Checks

```sh
node --check dist/app.js
node --check dist/engine.js
node --check dist/inventory.js
node --check dist/serial.js
node --test tests/*.test.mjs
```

## Boundaries

The website is a read-only recording tool, not a load controller or protective system. Clicking Stop recording cannot turn off a load. Firmware/hardware must enforce load limits, cut-offs, emergency stop and fault handling independently. Example profiles are not validated safety criteria. Voltage and current alone cannot certify a battery for use.

Actual hardware, supplied firmware and a production inventory were unavailable during implementation. Browser QA was unavailable in the managed development environment. Compile the helper for the chosen board and perform a supervised end-to-end check with the actual system before operational use.

Source is maintained with the private Site repository. Runtime records live in browser local storage unless explicitly sent to a connected API. No tokens are persisted; no telemetry is transmitted externally automatically.
