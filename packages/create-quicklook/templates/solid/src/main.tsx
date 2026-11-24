import { render } from '@solidjs/web';
import App from './app.tsx';
import './app.css';

const app = document.getElementById('app');
if (app) {
	render(() => <App />, app);
}
