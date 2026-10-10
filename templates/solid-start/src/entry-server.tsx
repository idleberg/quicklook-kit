// @refresh reload
import { createHandler, StartServer } from '@solidjs/start/server';

export default createHandler(() => (
	<StartServer
		document={({ assets, children, scripts }) => (
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<meta name="color-scheme" content="light dark" />
					<title>Preview</title>
					{assets}
				</head>
				<body>
					{/* biome-ignore lint/correctness/useUniqueElementIds: the document renders once; entry-client.tsx mounts into #app. */}
					<div id="app">{children}</div>
					{scripts}
				</body>
			</html>
		)}
	/>
));
