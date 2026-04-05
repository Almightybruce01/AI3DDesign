# AI3D Design Dashboard - Windsurf Edition

🎨 **AI-powered 3D design and CAD generation platform** built with Windsurf and Cursor integration for 3D printing preparation.

## Features

### 🎯 Core Functionality
- **AI-powered 3D model generation** with real-time preview
- **CAD file creation** (OBJ, STL formats)
- **Intricate image generation** for concept art
- **3D printing preparation** tools
- **Real-time dashboard** with progress tracking
- **File upload and processing** capabilities

### 💎 BRUCE Pendant Generator
- Customizable dimensions (width, height, depth)
- Diamond hole placement for baguettes in letters
- Round diamond holes around pendant perimeter
- Export to CAD and OBJ formats
- Ready for 3D printing

### 🐗 Boar with Sword Generator
- Intricate realistic artwork generation
- Customizable image dimensions
- High-resolution output
- Professional-grade details
- Download in multiple formats

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Start the dashboard:**
```bash
npm start
```

3. **Development mode:**
```bash
npm run dev
```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Use the **BRUCE Pendant Generator** to create CAD files with diamond holes
3. Use the **Boar Image Generator** to create intricate artwork
4. Upload existing 3D files for processing
5. View generated files in the gallery
6. Download files for 3D printing

## API Endpoints

### Generate BRUCE Pendant
```http
POST /api/generate/bruce-pendant
Content-Type: application/json

{
  "width": 50,
  "height": 20,
  "depth": 5,
  "diamondSize": 1.5
}
```

### Generate Boar Image
```http
POST /api/generate/boar-image
Content-Type: application/json

{
  "width": 1024,
  "height": 1024
}
```

### Upload Files
```http
POST /api/upload
Content-Type: multipart/form-data

file: [3D model file]
```

## File Structure

```
AI3DDesign/
├── server.js              # Main server application
├── package.json           # Dependencies and scripts
├── public/
│   └── index.html        # Dashboard interface
├── generated/            # Generated files (auto-created)
├── uploads/              # Uploaded files (auto-created)
└── README.md            # This file
```

## Generated Files

All generated files are saved with "windsurf" in the filename as requested:
- `bruce_pendant_windsurf_[timestamp].obj`
- `bruce_pendant_windsurf_[timestamp].cad`
- `boar_with_sword_windsurf_[timestamp].png`

## Technology Stack

- **Backend:** Node.js, Express.js, Socket.IO
- **3D Processing:** Three.js, OpenType.js
- **Image Processing:** Sharp, Canvas
- **Frontend:** HTML5, Tailwind CSS, JavaScript
- **Real-time:** Socket.IO for live updates

## 3D Printing Preparation

The generated files are optimized for 3D printing:
- **Manifold geometry** (no holes or intersections)
- **Proper wall thickness** for structural integrity
- **Diamond hole placement** for stone setting
- **Export formats** compatible with most slicers

## AI Integration

The dashboard integrates with Windsurf and Cursor AI capabilities:
- **Intelligent model generation** based on parameters
- **Automatic optimization** for 3D printing
- **Real-time processing** feedback
- **Adaptive algorithms** for complex geometries

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this for your 3D printing projects!

## Support

For issues or questions:
- Check the console logs for errors
- Ensure all dependencies are installed
- Verify file permissions for generated directories

---

🚀 **Happy 3D printing with AI-powered design!**
