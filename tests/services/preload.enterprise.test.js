jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: { invoke: jest.fn() },
}));

const { contextBridge, ipcRenderer } = require('electron');
require('../../electron/preload');

describe('Enterprise preload API', () => {
  test('sends the role payload in the shape expected by the main-process handler', () => {
    const api = contextBridge.exposeInMainWorld.mock.calls[0][1];
    const payload = {
      roleKey: 'floor_manager',
      roleName: 'مدير صالة',
      description: 'إدارة الصالة',
    };

    api.createSystemRole(payload);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('enterprise:createRole', payload);
  });
});
