declare module "regjsgen" {
  const regjsgen: {
    generate: (node: import("regjsparser").RootNode) => string;
  };
  export default regjsgen;
}
