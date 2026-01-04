// Storage service wrapper for chrome.storage.local
//we arew storeing key value pairs in local storage
//this is used to store user settings and data
//data includes isActive state, current job info, stats, etc.

export class StorageService {
  /**
   * Get value from storage
   */
  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key]);
      });
    });
  }

  /**
   * Set value in storage
   */
  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  /**
   * Get multiple values
   */
  async getMultiple(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * Set multiple values
   */
  async setMultiple(items) {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => {
        resolve();
      });
    });
  }

  /**
   * Remove value from storage
   */
  async remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => {
        resolve();
      });
    });
  }

  /**
   * Clear all storage
   */
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve();
      });
    });
  }

  /**
   * Get all storage data
   */
  async getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve(items);
      });
    });
  }
}
