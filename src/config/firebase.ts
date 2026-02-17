// Firebase has been temporarily removed/disabled
const mockFirebase = {
  messaging: () => ({
    send: async () => ({}),
    sendEachForMulticast: async () => ({ responses: [] }),
  }),
  app: () => ({}),
  apps: [],
  initializeApp: () => {},
  credential: {
    cert: () => {},
  },
};

export const firebaseApp = mockFirebase.app();
export const firebaseMessaging = mockFirebase.messaging();

export default mockFirebase;

