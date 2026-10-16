// Arranca la API (con recarga automática) y la interfaz de Vite en paralelo
// con un solo comando: npm run dev
import { spawn } from 'node:child_process';

const procesos = [
  spawn('npm', ['--prefix', 'server', 'run', 'dev'], { stdio: 'inherit' }),
  spawn('npm', ['--prefix', 'client', 'run', 'dev'], { stdio: 'inherit' }),
];
const terminar = () => procesos.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', terminar);
process.on('SIGTERM', terminar);
procesos.forEach((p) => p.on('exit', (codigo) => codigo && terminar()));
