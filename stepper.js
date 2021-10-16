import { range, wait } from "./helpers.js";
import Switch from "./switch.js";

export default class Stepper {
  constructor(pins, switchPin) {
    this.gpioSet = pins;
    this.switch = new Switch(switchPin);
  }

  steps = 512;
  partSteps = 512 * 8;
  sequence = [
    [1, 0, 0, 1],
    [1, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 1]
  ].reverse();
  currentStep = 0;
  currentPartStep = 0;
  seqIdx = 0;
  delay = 2;

  async setOutputs(outputs) {
    await Promise.all(
      this.gpioSet.map(function (gpio, index) {
        return gpio.rwite(outputs[index]);
      })
    );
  }

  changePartStepBy(num) {
    this.currentPartStep += num;
    this.currentStep =
      (this.currentPartStep - (this.currentPartStep % this.sequence.length)) /
      this.sequence.length;
    this.seqIdx += num;

    if (this.seqIdx < 0) {
      this.seqIdx = this.sequence.length + num;
    }

    if (this.seqIdx === this.sequence.length) {
      this.seqIdx = 0;
    }
  }

  async forwardFull(steps) {
    if (steps < 0) {
      return await this.backwardFull(-steps);
    }
    for (const step in range(steps)) {
      await this.forwardPart(this.sequence.length);
    }
  }

  async forwardPart(steps) {
    if (steps < 0) {
      return await this.backwardPart(-steps);
    }

    for (const step in range(steps)) {
      if (this.currentPartStep > this.partSteps / 2 && this.switch.check())
        return;
      this.changePartStepBy(1);
      await this.setOutputs(this.sequence[this.seqIdx]);
      await wait(this.delay);
    }
  }

  async backwardFull(steps) {
    if (steps < 0) {
      return await this.forwardFull(-steps);
    }
    for (const step in range(steps)) {
      await this.backwardPart(this.sequence.length);
    }
  }

  async backwardPart(steps) {
    const self = this;

    if (steps < 0) {
      return this.forwardPart(-steps);
    }

    for (const step in range(steps)) {
      if (this.currentPartStep < this.partSteps / 2 && this.switch.check())
        return;
      this.changePartStepBy(-1);
      await this.setOutputs(this.sequence[this.seqIdx]);
      await wait(this.delay);
    }
  }

  async cleanup() {
    if (this.currentPartStep > this.partSteps / 2) {
      this.backwardPart(1);
    }
    await this.init();
    this.switch.pin.unexport();

    await Promise.all(
      this.gpioSet.map(function (gpio) {
        return gpio.write(0);
      })
    );
    this.gpioSet = [];
  }

  async init() {
    await this.switch.check();
    while (!this.switch.pressed) {
      await this.backwardPart(1);
    }

    this.currentPartStep = 0;
    this.currentStep = 0;
  }
}
