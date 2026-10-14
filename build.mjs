import { build } from 'esbuild';
await build({ entryPoints: ['src/client.jsx'], bundle: true, format: 'cjs', platform: 'browser',
  external: ['react'], outfile: 'lib/client.js', loader: { '.css': 'text' },
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-douyin-companion",factory:(require)=>{const module={exports:{}};const exports=module.exports;' },
  footer: { js: 'return module.exports;}});' }, jsx: 'transform', target: 'chrome136' });
