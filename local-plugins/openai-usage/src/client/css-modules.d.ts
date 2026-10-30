/** CSS Modules are emitted and scoped by the shared client bundle preset. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
