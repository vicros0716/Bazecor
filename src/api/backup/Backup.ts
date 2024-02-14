import path from "path";
import fs from "fs";
import Store from "electron-store";
import { Neuron } from "@Renderer/types/neurons";
import { BackupType } from "@Renderer/types/backups";
import { DeviceClass } from "@Renderer/types/devices";

const store = new Store();

export default class Backup {
  neurons: Neuron[];

  constructor() {
    this.neurons = store.get("neurons") as Neuron[];
    this.DoBackup = this.DoBackup.bind(this);
  }

  /**
   * Function that returns the list of available commands excluding the ones that do not return usefull information for the backup
   * @returns An array with strings that contain the serial commands that are capable of returing the keyboard configuration
   */
  static async Commands(device: DeviceClass) {
    const notRequired = [
      "eeprom",
      "hardware",
      "settings.valid?",
      "settings.version",
      "settings.crc",
      "keymap.default",
      "layer",
      "help",
      "version",
      "led.mode",
      "led.theme",
      "led.at",
      "led.setMultiple",
      "led.getMultiple",
      "led.setAll",
      "macros.trigger",
      "qukeys",
      "upgrade",
      "settings.printConfig",
      "settings.aliveInterval",
      "settings.spiSpeed",
      "settings.cpuSpeed",
      "settings.ledDriverPullUp",
      "settings.underGlow",
      "settings.ledDriver",
    ];
    const commands = await device.command("help");
    return commands.split(/\r?\n/).filter(c => !notRequired.some(v => c.includes(v)));
  }

  /**
   * The function is desgned to make a backup of the whole configuration pertaining the Raise keyboard
   *
   * To achieve this it uses both the list of commands provided by the caller and the neuron ID which
   * will help the function retrieve the current neuron configuration stored locally, so it can be added
   * to the backup
   *
   * @param {Array<string>} commands The required list of commands to be executed on the keyboard, they are retrieved using the Backup.commands function of this same module, you can add or remove from that list as needed.
   * @param {string} neuronID This parameter contains the neuronID obtained from the Raise, so the corresponding local settings can be retrieved.
   * @returns {Backup} Backup The function returns the full made backup, so it can be stored wherever is needed, and changed if the module requires it.
   */
  async DoBackup(commands: string[], neuronID: string, device: DeviceClass) {
    if (device.file !== false) return undefined;
    const backup: BackupType = {
      neuronID: undefined,
      neuron: undefined,
      versions: undefined,
      backup: undefined,
    };
    const commandList = [];
    for (let i = 0; i < commands.length; i += 1) {
      const command = commands[i];
      console.log(command);
      // eslint-disable-next-line no-await-in-loop
      const data = await device.command(command);
      commandList.push({ command, data });
    }
    const vData = await device.command("version");
    const parts = vData.split(" ");
    const versions = {
      bazecor: parts[0],
      kaleidoscope: parts[1],
      firmware: parts[2],
    };
    backup.neuronID = neuronID;
    backup.neuron = this.neurons.find(n => n.id === neuronID);
    if (backup.neuron === undefined)
      backup.neuron = {
        device: undefined,
        id: "",
        name: "",
        layers: [],
        macros: [],
        superkeys: [],
      };
    backup.neuron.device = device.device;
    backup.versions = versions;
    backup.backup = commandList;
    return backup;
  }

  /**
   * This function physically stores the backup file passed as a variable, the backup is stored in the settings.backupFolder and it uses the following file format
   *
   * RaiseBackup-YYYYMMDDhhmmss.json
   * @param {*} localBackup The backup data object to be stored locally
   * @returns True when the function has successfully stored the backup locally, and false if something fails, an error log will be also pushed to the console
   */
  static SaveBackup(backup: BackupType, device: DeviceClass) {
    const localBackup = { ...backup };
    if (device.file !== false) {
      const file = JSON.parse(fs.readFileSync(device.fileData.device.filePath).toString("utf-8"));
      file.virtual = device.fileData.virtual;
      const json = JSON.stringify(file, null, 2);
      try {
        fs.writeFileSync(device.fileData.device.filePath, json);
      } catch (error) {
        console.error(error);
        throw error;
      }
      return true;
    }
    const { product } = device.device.info;
    const d = new Date();
    const folder = store.get("settings.backupFolder") as string;
    try {
      if (localBackup.neuron.name === undefined || localBackup.neuron.name === "") localBackup.neuron.name = "NoName";
      const folderPath = path.join(folder, product, localBackup.neuronID);
      const fullPath = path.join(
        folder,
        product,
        localBackup.neuronID,
        `${
          d.getFullYear() +
          `0${d.getMonth() + 1}`.slice(-2) +
          `0${d.getDate()}`.slice(-2) +
          `0${d.getHours()}`.slice(-2) +
          `0${d.getMinutes()}`.slice(-2) +
          `0${d.getSeconds()}`.slice(-2)
        }-${localBackup.neuron.name.replace(/[^\w\s]/gi, "")}.json`,
      );
      const json = JSON.stringify(localBackup, null, 2);
      console.log(fullPath, folderPath, localBackup);
      console.log("Creating folders");
      fs.mkdir(folderPath, { recursive: true }, err => {
        if (err) {
          console.error(err);
          throw err;
        }
      });
      console.log(`Saving Backup to -> ${fullPath}`);
      try {
        fs.writeFileSync(fullPath, json);
      } catch (error) {
        console.error(error);
        throw error;
      }
      return true;
    } catch (error) {
      console.warn("Error ocurred when saving backup to folder");
      throw new Error(error);
    }
  }
  static isBackupType = (backup: any): backup is BackupType => "backup" in backup;
}
