load('api_timer.js');
load('api_arduino_bme280.js');
load('api_gpio.js');
load('api_sys.js');
load('api_config.js');
load('api_i2c.js');

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
let deviceId = Cfg.get('device.id');

GPIO.set_mode(ENV_LED_GREEN, GPIO.MODE_OUTPUT);
GPIO.set_mode(ENV_LED_RED, GPIO.MODE_OUTPUT);


if (bme === undefined) {
  print('Cant find a sensor');
} else {
  bmeOnline = true;
}

let getSystemInfo = function () {
  return JSON.stringify({
    data: {
      deviceId: deviceId,
      totalRAM: Sys.total_ram(),
      freeRAM: Sys.free_ram(),
      uptime: Sys.uptime(),
      model: "env ib-1",
      firmware: "1.0.1a"
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
  let tempCelsius = ((tempKelvin * 0.1) - 273.15);

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
    data: {
      voltage: voltage,
      temperature: tempCelsius,
      batteryLevel: stateOfCharge,
      fullAvailableCapacity: fullAvailableCapacity,
      remainingCapacity: remainingCapacity
    }
  });

  return message;
}

function timerCallback() {
  let message;

  message = getSystemInfo();
  print('getSystemInfo message: ', message);

  message = getBME280Info();
  print('getBME280Info message: ', message);

  message = getBQ27441Info();
  print('getBQ27441Info message: ', message);

}

Timer.set(10000, Timer.REPEAT, timerCallback, null);

// Toogle LED
GPIO.set_button_handler(ENV_BUTTON, GPIO.PULL_UP, GPIO.INT_EDGE_NEG, 20, function () {
  let i = 0;
  let stateRed = 0;
  let stateGreen = 0;

  print("Toggled LED, state is: ", stateRed ? 'on' : 'off');
  print("Toggled LED, state is: ", stateGreen ? 'on' : 'off');

  for (i = 0; i < 3; i++) {
    stateRed = GPIO.toggle(ENV_LED_RED);
    Sys.usleep(1000000);
    stateGreen = GPIO.toggle(ENV_LED_GREEN);
    Sys.usleep(1000000);
  }

}, null);