# Experiment Detector Chrome Extension

A Chrome extension that detects A/B testing and experimentation platforms running on websites. It identifies popular experimentation platforms and shows active experiments running on the current page.

## Features

- Detects popular experimentation platforms (Optimizely, VWO, Google Optimize, LaunchDarkly, Split.io, etc.)
- Shows active experiments and their variations
- Real-time monitoring of dynamically loaded experiments
- Clean and modern UI

## Supported Platforms

The extension can detect the following experimentation platforms:
- Optimizely
- VWO (Visual Website Optimizer)
- Google Optimize
- LaunchDarkly
- Split.io
- Amplitude Experiment
- And more through generic detection

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files

## Usage

1. Click the extension icon in your Chrome toolbar to open the popup
2. The extension will automatically scan the current page for:
   - Experimentation platforms
   - Active experiments
   - Experiment variations
3. Results will be displayed in a clean, organized interface

## Development

To modify or enhance the extension:

1. Clone the repository
2. Make your changes to the source files
3. Reload the extension in Chrome to test your changes

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

- Extension icons: [Ab test icons created by nangicon - Flaticon](https://www.flaticon.com/free-icons/ab-test)

## License

MIT License - feel free to use this code in your own projects. 