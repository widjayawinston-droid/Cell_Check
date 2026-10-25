#pragma once
#include <Arduino.h>
#include <math.h>

// Telemetry formatting only: this helper does not read sensors or control a load.
// Call Serial.begin(115200) in setup(). Call this function at about 5 Hz with
// calibrated sensor readings and the load state reported by your firmware.
inline bool publishCellCheckTelemetry(Stream &out, const char *batteryId,
                                     float voltageV, float currentA,
                                     float loadOhm, bool loadActive) {
  static unsigned long sequence = 0;
  bool validId = batteryId != nullptr;
  size_t length = 0;
  if (validId) {
    while (batteryId[length] != '\0' && length < 49) {
      const char c = batteryId[length];
      if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
            (c >= '0' && c <= '9') || c == '-' || c == '_')) validId = false;
      ++length;
    }
    validId = validId && length > 0 && length <= 48;
  }
  if (!validId || !isfinite(voltageV) || !isfinite(currentA) ||
      voltageV < 0 || currentA < 0 || voltageV > 10000 || currentA > 10000 ||
      (loadActive && (!isfinite(loadOhm) || loadOhm <= 0))) {
    out.println(F("{\"type\":\"fault\",\"reason\":\"invalid_sensor_or_metadata\"}"));
    return false;
  }
  out.print(F("{\"type\":\"telemetry\",\"battery_id\":\""));
  out.print(batteryId);
  out.print(F("\",\"seq\":")); out.print(sequence++);
  out.print(F(",\"ms\":")); out.print(millis());
  out.print(F(",\"voltage\":")); out.print(voltageV, 4);
  out.print(F(",\"current\":")); out.print(currentA, 4);
  out.print(F(",\"load_ohm\":"));
  if (loadActive) out.print(loadOhm, 4); else out.print(F("null"));
  out.print(F(",\"load_active\":"));
  out.print(loadActive ? F("true") : F("false"));
  out.println(F("}"));
  return true;
}
