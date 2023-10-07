# IOT-Platform-integration

Repository contains bridges, integrations and bots written in Deno for [IoT Platform](github.com/founek2/IOT-Platform). It is used to integrate other HW devices which do not support direct connection thus allowing to connect ideally all of your devices to a single platform.

IoT Platform currently does not support any kinds of plugins, so integrations is done via this project - it emulates every device acting as a bridge for communication.

## Bridges

Exposing of all devices.

- Frigate (NVR) - integrate all your cameras, show current feed and events (snapshots)
- Zigbee2mqtt - integrate all your Zigbee devices

## Devices

- Sony bravia TV
  - turn on/off
  - display custom html website
  - change volume
- Intex whirlpool - integrated via TCP connection to ESP display
  - current and target temperate
  - control: heating, bubbles, nozzles, filtration
- Solax inverter - integrated via Solax Cloud service, since gen X3 does not allow reading of MQTT messages (before it was just plain JSON)
  - Reading of all available values

## Examples

<img src="./_media/screenshots/camera_dialog.png" alt="Dialog" width="400"/>

> Image shows integrated single camera via Frigate

<img src="./_media/screenshots/camera_dialog.png" alt="Zigbee valve" width="400"/>

> Image shows integration for Zigbee water valve <https://www.zigbee2mqtt.io/devices/QT06_1.html>

Solax inverter             |  Solax baterry
:-------------------------:|:-------------------------:
<img src="./_media/screenshots/solax_dialog.png" alt="Solax inverter" width="400"/> |  <img src="./_media/screenshots/solax_baterry_dialog.png" alt="Solax inverter" width="400"/>

> Integration for Solax X3 <https://www.zigbee2mqtt.io/devices/QT06_1.html>
