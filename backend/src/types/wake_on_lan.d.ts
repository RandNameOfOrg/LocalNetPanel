declare module 'wake_on_lan' {
  function wake(mac: string, cb: (err?: Error) => void): void;
  export { wake };
}
