/* bazecor-focus -- Bazecor Focus protocol library
 * Copyright (C) 2018, 2019  Keyboardio, Inc.
 * Copyright (C) 2019, 2020 DygmaLab SE
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import type { AutoDetectTypes, PortInfo } from "@serialport/bindings-cpp";
import { spawn } from "child_process";
import fs from "fs";
import type { SerialPort, SerialPortOpenOptions } from "serialport";
import { delay } from "../flash/delay";
import { ctx } from "./Focus.ctx";

// TODO: any reason we can't import directly?
const sp = eval('require("serialport")');
const { DelimiterParser } = eval('require("@serialport/parser-delimiter")');

type AnyFunction = (...args: unknown[]) => unknown;

type CommandOverrides = Record<string, AnyFunction | { focus: AnyFunction; [k: string]: AnyFunction }>;

export class Focus {
  public static getInstance() {
    if (ctx.instance) return ctx.instance;
    return (ctx.instance = new Focus());
  }
  public timeout = 5000;
  public debug = false;
  closed = true;
  file = false;
  commands: CommandOverrides = { help: this._help };
  protected logger = console;
  constructor() {}

  protected debugLog(...args: unknown[]) {
    if (!this.debug) return;
    // TODO: should be able to use `this.logger.debug` instead
    this.logger.log(...args);
  }

  protected async listSerialPorts(): Promise<PortInfo[]> {
    return sp.SerialPort.list();
  }
  protected createSerialPort<T extends AutoDetectTypes>(
    options: SerialPortOpenOptions<T>,
    openCallback?: ErrorCallback,
  ): SerialPort<T> {
    return new sp.SerialPort(options, openCallback);
  }

  async find(...devices: Array<{ usb: { productId: number; vendorId: number } }>) {
    const portList = await this.listSerialPorts();

    const foundDevices = [];

    this.debugLog("focus.find: portList:", portList, "devices:", devices);
    this.logger.log("Passed devices", devices);
    this.logger.log("Port list from where");
    for (const port of portList) {
      for (const device of devices) {
        if (parseInt(`0x${port.productId}`) == device.usb.productId && parseInt(`0x${port.vendorId}`) == device.usb.vendorId) {
          foundDevices.push({ ...port, device });
        }
      }
    }

    this.debugLog("focus.find: foundDevices:", foundDevices);

    return foundDevices;
  }
  device: any;
  result: string;
  callbacks: any[];
  fileData: any;
  supportedCommands: any;
  _port: any;
  parser: any;
  private async fileOpen(_info: unknown, file: any) {
    // console.log("DATA!!", info, file);
    this.device = file.device;
    this.result = "";
    this.callbacks = [];
    this.closed = false;
    this.file = true;
    this.fileData = file;
    this.supportedCommands = await this.command("help");
  }

  async open(device: any, info: any, file: any) {
    if (file !== null) {
      await this.fileOpen(info, file);
      return true;
    }

    if (this._port !== undefined && this._port.isOpen === false) {
      this.close();
    }

    // console.log("Warning! device being opened");
    // console.log("port status opened?", this._port ? this._port.isOpen : "unknown");
    // console.log("received device", device);
    // console.log("received info: ", info);
    try {
      let path;
      if (typeof device === "string") path = device;
      if (typeof device === "object") path = device.settings.path;
      if (path !== undefined) {
        const testingDevices = await this.listSerialPorts();
        console.log(testingDevices);
        this._port = this.createSerialPort({ path, baudRate: 115200, autoOpen: false, endOnClose: true });
        await this._port.open((err: any) => {
          if (err) console.error("error when opening port: ", err);
          else console.log("connected");
        });
      } else {
        throw Error("device not a string or object!");
      }

      this.device = info;
      this.parser = this._port.pipe(new DelimiterParser({ delimiter: "\r\n" }));
      this.result = "";
      this.callbacks = [];
      this.supportedCommands = [];
      this.parser.on("data", (data: any) => {
        data = data.toString("utf-8");
        this.debugLog("focus: incoming data:", data);

        if (data === "." || data.endsWith(".")) {
          const { result } = this;
          const resolve = this.callbacks.shift();

          this.result = "";
          if (resolve) {
            resolve(result.trim());
          }
        } else if (this.result.length === 0) {
          this.result = data;
        } else {
          this.result += `\r\n${data}`;
        }
      });

      if (process.platform === "darwin") {
        spawn("stty", ["-f", this._port.path, "clocal"]);
      }

      // It's not necessary to retreive the supported commands in bootloader mode
      if (!this.device.bootloader) {
        try {
          this.supportedCommands = await this.command("help");
        } catch (e) {
          console.warn(e);
          // Ignore
        }
      }
    } catch (error) {
      console.error("found this error while opening!", error);
      // throw new Error("Unable to connect");
    }

    // Setup error port alert
    this._port.on("error", async function (err: any) {
      console.error(`Error on SerialPort: ${err}`);
      await this._port.close();
    });
    this.closed = false;
    return this._port;
  }

  private clearContext() {
    this.result = "";
    this.callbacks = [];
    this.device = null;
    this.supportedCommands = [];
    this.file = false;
    this.fileData = null;
  }

  async close() {
    if (this.file !== false) {
      this.clearContext();
      this.closed = true;
      return true;
    }
    let result;
    try {
      if (this._port) {
        while (this._port.isOpen === true) {
          console.log("Closing device port!!", this._port);
          result = await this._port.close();
          // console.log("is it still open? ", this._port.isOpen, result);
          await this._port.removeAllListeners();
          await this._port.destroy();
          // console.log("is it destroyed?", this._port.destroyed);
        }
        delete this._port;
        this.closed = true;
        await delay(200);
      }
    } catch (error) {
      console.error("error when closing", error);
    }

    this.clearContext();
    return result;
  }

  async isDeviceAccessible(port: { path: string }) {
    if (process.platform !== "linux") return true;

    try {
      fs.accessSync(port.path, fs.constants.R_OK | fs.constants.W_OK);
    } catch (e) {
      return false;
    }
    return true;
  }

  async isDeviceSupported(device: { device: { isDeviceSupported?: (device: unknown) => Promise<boolean> } }) {
    if (!device.device.isDeviceSupported) {
      return true;
    }
    const supported = await device.device.isDeviceSupported(device);
    this.debugLog("focus.isDeviceSupported: port=", device, "supported=", supported);
    return supported;
  }

  isCommandSupported(cmd: string) {
    return this.supportedCommands.indexOf(cmd) !== -1;
  }

  async _write_parts(parts: any[], cb: any) {
    if (!parts || parts.length === 0) {
      cb();
      return;
    }

    let part = parts.shift();
    part += " ";
    this._port.write(part);
    this._port.drain(async () => {
      await this._write_parts(parts, cb);
    });
  }

  request<T>(cmd: string, ...args: unknown[]) {
    this.debugLog("focus.request:", cmd, ...args);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject("Communication timeout");
      }, this.timeout);
      this._request(cmd, ...args)
        .then((data: T) => {
          clearTimeout(timer);
          resolve(data);
        })
        .catch(err => {
          console.log("Error sending request from focus", err);
          reject("Error sending request from focus");
        });
    });
  }

  private async _request(cmd: string, ...args: unknown[]) {
    if (this.file === true) {
      console.log("performing virtual request");
      if (args.length > 0 && this.fileData.virtual[cmd].eraseable) {
        this.fileData.virtual[cmd].data = args.join(" ");
      }
      console.log(`reading virtual data from ${cmd}: `, this.fileData.virtual[cmd]);
      let result = "";
      if (this.fileData.virtual[cmd] !== undefined) {
        result = this.fileData.virtual[cmd].data;
      }
      console.log(result);
      return new Promise(resolve => {
        resolve(result);
      });
    }
    console.log("performing request");
    if (!this._port) throw "Device not connected!";

    let request = cmd;
    if (args && args.length > 0) {
      request = `${request} ${args.join(" ")}`;
    }
    request += "\n";

    return new Promise(resolve => {
      this.callbacks.push(resolve);
      this._port.write(request);
    });
  }

  async command(cmd: string, ...args: unknown[]) {
    const override = this.commands[cmd];
    if (typeof override === "function") {
      return override(this, ...args);
    }
    if (typeof override === "object") {
      return override.focus(this, ...args);
    }
    return this.request(cmd, ...args);
  }

  addCommands(cmds: CommandOverrides) {
    Object.assign(this.commands, cmds);
  }

  addMethod(methodName: string, command: string) {
    const self: any = this;
    if (self[methodName]) {
      const tmp = self[methodName];
      self[methodName] = (...args: unknown[]) => {
        tmp(...args);
        (this.commands[command] as any)[methodName](...args);
      };
    } else {
      self[methodName] = (...args: unknown[]) => {
        (this.commands[command] as any)[methodName](...args);
      };
    }
  }

  private async _help(s: Focus) {
    const data = await s.request<string>("help");
    return data.split(/\r?\n/).filter((v: string) => v.length > 0);
  }
}
