# quicklook-kit

Turns a web page into a file preview for the operating system's quick-look feature, so preview authors write a page and the kit supplies the native side.

## Language

**Platform**:
An operating system a project can build a preview for, together with the quick-look host it plugs into there: macOS with Quick Look, or Windows with QL-Win QuickLook.
_Avoid_: Target, OS

**File type**:
A kind of file a preview claims, named the way its platform names kinds of files: a type identifier on macOS, an extension on Windows.
_Avoid_: Type, format

**Target**:
A product inside the generated Xcode project, such as the app or the Quick Look extension.
_Avoid_: Platform
