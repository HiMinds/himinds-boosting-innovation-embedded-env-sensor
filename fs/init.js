/*
 * Copyright (c) HiMinds.com
 *
 * Author:  Suru Dissanaike <suru.dissanaike@himinds.com>
 *
* MIT License
*
* Copyright (c) 2020
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

load('api_timer.js');
load('api_mqtt.js');
load('api_arduino_bme280.js');
load('api_gpio.js');
load('api_sys.js');
load('api_config.js');
load('api_i2c.js');
load('api_esp32.js');


let topicEnvMeasurement = "/v1/env/measurement/";
let topicEnvSystem = "/v1/env/system/";
let topicEnvBattery = "/v1/env/battery/";
let bmeOnline = false;

//
let ENV_BUTTON = 13;
let ENV_LED_GREEN = 15;
let ENV_LED_RED = 16;

// Default sensors address for BME280
let BME280_I2C_ADDRESS = 0x76;
let BQ27441_I2C_ADDRESS = 0x55;

let BQ27441_COMMAND_CONTROL = 0x00; // Control
let BQ27441_COMMAND_TEMP = 0x02; // Temperature 0.1°K
let BQ27441_COMMAND_VOLTAGE = 0x04; // Voltage mV
let BQ27441_COMMAND_FLAGS = 0x06; // Flags
let BQ27441_COMMAND_NOM_CAPACITY = 0x08; // NominalAvailableCapacity mAh
let BQ27441_COMMAND_AVAIL_CAPACITY = 0x0A; // FullAvailableCapacity mAh
let BQ27441_COMMAND_REM_CAPACITY = 0x0C; // RemainingCapacity mAh
let BQ27441_COMMAND_FULL_CAPACITY = 0x0E; // FullChargeCapacity mAh
let BQ27441_COMMAND_AVG_CURRENT = 0x10; // AverageCurrent mA
let BQ27441_COMMAND_STDBY_CURRENT = 0x12; // StandbyCurrent mA
let BQ27441_COMMAND_MAX_CURRENT = 0x14; // MaxLoadCurrent mA
let BQ27441_COMMAND_AVG_POWER = 0x18; // AveragePower mW
let BQ27441_COMMAND_SOC = 0x1C; // StateOfCharge %
let BQ27441_COMMAND_INT_TEMP = 0x1E; // InternalTemperature 0.1°K
let BQ27441_COMMAND_SOH = 0x20; // StateOfHealth num/%
let BQ27441_COMMAND_REM_CAP_UNFL = 0x28; // RemainingCapacityUnfiltered mAh
let BQ27441_COMMAND_REM_CAP_FIL = 0x2A; // RemainingCapacityFiltered mAh
let BQ27441_COMMAND_FULL_CAP_UNFL = 0x2C; // FullChargeCapacityUnfiltered mAh
let BQ27441_COMMAND_FULL_CAP_FIL = 0x2E; // FullChargeCapacityFiltered mAh
let BQ27441_COMMAND_SOC_UNFL = 0x30; // StateOfChargeUnfiltered mAh

// Initialize Adafruit_BME280 library using the I2C interface
let bme = Adafruit_BME280.createI2C(BME280_I2C_ADDRESS);

GPIO.set_mode(ENV_LED_GREEN, GPIO.MODE_OUTPUT);
GPIO.set_mode(ENV_LED_RED, GPIO.MODE_OUTPUT);


if (bme === undefined) {
  print('Cant find a sensor');
} else {
  bmeOnline = true;
}

//Set the temperature difference between your room and ESP32
let tempOffset = 15;

// convert Fahrenheit to Celsius
function getTemperature() {
    return ((5 / 9) * (ESP32.temp() - 32) - tempOffset);
}

let getSystemInfo = function () {
  return JSON.stringify({
    device_id: Cfg.get('device.id'),
    data: {
      total_ram: Sys.total_ram(),
      free_ram: Sys.free_ram(),
      uptime: Sys.uptime(),
      model: "env ib-1",
      firmware: "1.0.1a",
      core_temperature:getTemperature()
    }
  });
};

let getBME280Info = function () {

  let message = "BME off-line";

  if (bmeOnline === true) {
    let temperature = bme.readTemperature();
    let humidity = bme.readHumidity();
    let pressure = bme.readPressure();

    message = JSON.stringify({
      device_id: Cfg.get('device.id'),
      data: {
        temperature: temperature,
        humidity: humidity,
        pressure: pressure
      }
    });
  }
  return message;
};

//bq27441
function getBQ27441Info() {

  let message = "bq27441 off-line";

  function swap16(val) {
    return ((val & 0xFF) << 8) |
      ((val >> 8) & 0xFF);
  }

  let bus = I2C.get();
  let voltage = (swap16(I2C.readRegW(bus, BQ27441_I2C_ADDRESS, BQ27441_COMMAND_VOLTAGE))) / 1000;

  if (voltage >= 0) {
    print("Voltage: ", voltage);
  } else {
    print("No response");
  }

  let tempKelvin = swap16(I2C.readRegW(bus, BQ27441_I2C_ADDRESS, BQ27441_COMMAND_TEMP));
  let tempCelsius = (tempKelvin - 273.15) / 100;

  if (tempCelsius >= 0) {
    print("Celsius: ", tempCelsius);
  } else {
    print("No response");
  }

  let fullAvailableCapacity = swap16(I2C.readRegW(bus, BQ27441_I2C_ADDRESS, BQ27441_COMMAND_AVAIL_CAPACITY)) / 1000;

  if (fullAvailableCapacity >= 0) {
    print("Full Available Capacity: ", fullAvailableCapacity);
  } else {
    print("No response");
  }

  let remainingCapacity = swap16(I2C.readRegW(bus, BQ27441_I2C_ADDRESS, BQ27441_COMMAND_REM_CAPACITY)) / 1000;

  if (remainingCapacity >= 0) {
    print("Remaining Capacity: ", remainingCapacity);
  } else {
    print("No response");
  }

  //This read-only function returns an unsigned integer value of the predicted remaining battery capacity
  // expressed as a percentage of FullChargeCapacity() with a range of 0 to 100%.
  let stateOfCharge = swap16(I2C.readRegW(bus, BQ27441_I2C_ADDRESS, BQ27441_COMMAND_SOC));



  message = JSON.stringify({
    device_id: Cfg.get('device.id'),
    data: {
      voltage: voltage,
      temperature: tempCelsius,
      battery_level: stateOfCharge,
      full_available_capacity: fullAvailableCapacity,
      remaining_capacity: remainingCapacity
    }
  });

  return message;
}

function timerCallback() {
  let message;
  let pubResult;

  message = getSystemInfo();
  pubResult = MQTT.pub(topicEnvSystem, message, 0);
  print('Published:', pubResult ? 'yes' : 'no', 'topic:', topicEnvSystem, 'message:', message);

  message = getBME280Info();
  pubResult = MQTT.pub(topicEnvMeasurement, message, 0);
  print('Published:', pubResult ? 'yes' : 'no', 'topic:', topicEnvMeasurement, 'message:', message);

  message = getBQ27441Info();
  pubResult = MQTT.pub(topicEnvBattery, message, 0);
  print('Published:', pubResult ? 'yes' : 'no', 'topic:', topicEnvBattery, 'message:', message);

}

MQTT.setEventHandler(function (conn, ev, edata) {
  // Wait for MQTT.EV_CONNACK to ensure the mqtt connection is established
  if (MQTT.EV_CONNACK === ev) {
    print('=== MQTT event handler: got MQTT.EV_CONNACK');

    Timer.set(10000, Timer.REPEAT, timerCallback, null);
  }

}, null);