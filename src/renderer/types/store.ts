export interface StorageType {
  settings: {
    backupFolder: string;
    backupFrequency: number;
    language: string;
    darkMode: string;
    showDefaults: boolean;
    isStandardView: boolean;
  };
  neurons: unknown[];
}
