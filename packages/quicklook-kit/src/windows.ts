// Describes the QL-Win plugin project the CLI builds with `dotnet build`. The
// host itself, native/Windows/Plugin.cs, reads everything from quicklook.json.

import { type ResolvedConfig, type Setting, serializeCsp, type WindowsConfig } from './config.ts';

type PluginConfig = Pick<ResolvedConfig, 'name' | 'csp' | 'maxFileSize' | 'settings'> & {
	windows: WindowsConfig;
};

const xmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const xmlSpecial = /[&<>]/g;
function xml(text: string) {
	return text.replace(xmlSpecial, (char) => xmlEscapes[char] ?? char);
}

/** The settings schema as a flat list keyed like QL-Win's settings file, `editor.fontSize`. */
function flatSettings(settings: Record<string, Setting>, prefix = ''): object[] {
	return Object.entries(settings).flatMap(([name, setting]) => {
		const key = prefix + name;
		if (setting.type === 'object') {
			return flatSettings(setting.properties, `${key}.`);
		}
		const { type, default: fallback } = setting;
		const {
			enum: options,
			minimum,
			maximum,
		} = setting as Setting & {
			enum?: unknown[];
			minimum?: number;
			maximum?: number;
		};
		return [
			{
				key,
				type,
				default: fallback,
				...(options && {
					enum: options.map((option) =>
						typeof option === 'object' && option ? (option as { value: unknown }).value : option,
					),
				}),
				...(minimum !== undefined && { minimum }),
				...(maximum !== undefined && { maximum }),
			},
		];
	});
}

/** The plugin project's generated files, by name. The CLI adds the host source and `web/`. */
export function windowsProject(
	config: PluginConfig,
	version: string,
): {
	'QuickLook.Plugin.Metadata.config': string;
	'quicklook.json': string;
	[csproj: `${string}.csproj`]: string;
} {
	const { id, extensions } = config.windows;
	return {
		[`${id}.csproj`]: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <AssemblyName>${id}</AssemblyName>
    <RootNamespace>${id}</RootNamespace>
    <Version>${xml(version)}</Version>
    <LangVersion>latest</LangVersion>
    <AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>
  </PropertyGroup>

  <ItemGroup>
    <!-- Lets a non-Windows SDK compile against .NET Framework, WPF included, without UseWPF -->
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3" PrivateAssets="all" />
    <!-- QL-Win loads QuickLook.Common itself, so compile against it but don't ship it -->
    <PackageReference Include="QuickLook.Common" Version="4.5.0" ExcludeAssets="runtime" />
    <!-- Same version as QL-Win's built-in viewers -->
    <PackageReference Include="Microsoft.Web.WebView2" Version="1.0.4078.44" />
    <Reference Include="PresentationCore" />
    <Reference Include="PresentationFramework" />
    <Reference Include="WindowsBase" />
    <Reference Include="System.Xaml" />
    <Reference Include="System.Web" />
    <Reference Include="System.Web.Extensions" />
  </ItemGroup>

  <ItemGroup>
    <None Include="QuickLook.Plugin.Metadata.config" CopyToOutputDirectory="PreserveNewest" />
    <None Include="quicklook.json" CopyToOutputDirectory="PreserveNewest" />
    <None Include="web/**" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
`,
		// Read by QL-Win when installing a .qlplugin: the folder name and the install dialog.
		'QuickLook.Plugin.Metadata.config': `<?xml version="1.0" encoding="utf-8"?>
<Metadata>
  <Namespace>${id}</Namespace>
  <Version>${xml(version)}</Version>
  <Description>${xml(config.name)}</Description>
</Metadata>
`,
		'quicklook.json': JSON.stringify({
			id,
			extensions: extensions.map((extension) => extension.toLowerCase()),
			maxFileSize: config.maxFileSize,
			csp: serializeCsp(config.csp),
			settings: flatSettings(config.settings),
		}),
	};
}
