param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [int]$CellSize = 314,
  [int]$GridSize = 4,
  [int]$Margin = 8
)

$ErrorActionPreference = "Stop"

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

public static class SpriteSheetRepacker
{
    private sealed class Component
    {
        public readonly List<int> Pixels = new List<int>();
        public int MinX = int.MaxValue;
        public int MinY = int.MaxValue;
        public int MaxX = int.MinValue;
        public int MaxY = int.MinValue;
        public int Area { get { return Pixels.Count; } }
        public double CenterX { get { return (MinX + MaxX) / 2.0; } }
        public double CenterY { get { return (MinY + MaxY) / 2.0; } }
    }

    public static string Repack(string inputPath, string outputPath, int cellSize, int gridSize, int margin)
    {
        using (var loaded = new Bitmap(inputPath))
        using (var source = new Bitmap(loaded.Width, loaded.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(source))
            {
                graphics.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                graphics.DrawImageUnscaled(loaded, 0, 0);
            }

            int width = source.Width;
            int height = source.Height;
            int expected = cellSize * gridSize;
            if (width != expected || height != expected)
                throw new InvalidOperationException("Expected " + expected + "x" + expected + ", got " + width + "x" + height + ".");

            var rect = new Rectangle(0, 0, width, height);
            var sourceData = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] sourceBytes;
            int stride;
            try
            {
                stride = sourceData.Stride;
                sourceBytes = new byte[Math.Abs(stride) * height];
                Marshal.Copy(sourceData.Scan0, sourceBytes, 0, sourceBytes.Length);
            }
            finally
            {
                source.UnlockBits(sourceData);
            }

            var opaque = new bool[width * height];
            for (int y = 0; y < height; y++)
            {
                int row = y * stride;
                for (int x = 0; x < width; x++)
                    opaque[y * width + x] = sourceBytes[row + x * 4 + 3] > 8;
            }

            var visited = new bool[width * height];
            var queue = new int[width * height];
            var components = new List<Component>();

            for (int start = 0; start < opaque.Length; start++)
            {
                if (!opaque[start] || visited[start])
                    continue;

                var component = new Component();
                int head = 0;
                int tail = 0;
                queue[tail++] = start;
                visited[start] = true;

                while (head < tail)
                {
                    int index = queue[head++];
                    int x = index % width;
                    int y = index / width;
                    component.Pixels.Add(index);
                    component.MinX = Math.Min(component.MinX, x);
                    component.MinY = Math.Min(component.MinY, y);
                    component.MaxX = Math.Max(component.MaxX, x);
                    component.MaxY = Math.Max(component.MaxY, y);

                    for (int dy = -1; dy <= 1; dy++)
                    {
                        for (int dx = -1; dx <= 1; dx++)
                        {
                            if (dx == 0 && dy == 0) continue;
                            int nx = x + dx;
                            int ny = y + dy;
                            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                            int next = ny * width + nx;
                            if (!opaque[next] || visited[next]) continue;
                            visited[next] = true;
                            queue[tail++] = next;
                        }
                    }
                }

                components.Add(component);
            }

            var sprites = components
                .Where(c => c.Area >= 256)
                .OrderByDescending(c => c.Area)
                .Take(gridSize * gridSize)
                .ToList();

            if (sprites.Count != gridSize * gridSize)
                throw new InvalidOperationException("Expected 16 sprite components, found " + sprites.Count + ".");

            sprites = sprites.OrderBy(c => c.CenterY).ToList();
            var ordered = new List<Component>();
            for (int row = 0; row < gridSize; row++)
                ordered.AddRange(sprites.Skip(row * gridSize).Take(gridSize).OrderBy(c => c.CenterX));

            using (var target = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                var targetData = target.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                byte[] targetBytes = new byte[Math.Abs(targetData.Stride) * height];
                var report = new List<string>();
                report.Add("components=" + components.Count + " sprites=" + ordered.Count);

                for (int frame = 0; frame < ordered.Count; frame++)
                {
                    var component = ordered[frame];
                    int row = frame / gridSize;
                    int column = frame % gridSize;
                    int spriteWidth = component.MaxX - component.MinX + 1;
                    int spriteHeight = component.MaxY - component.MinY + 1;
                    if (spriteWidth > cellSize - margin * 2 || spriteHeight > cellSize - margin * 2)
                        throw new InvalidOperationException("Frame " + frame + " is too large for the requested margin.");

                    int localX = component.MinX - column * cellSize;
                    int localY = component.MinY - row * cellSize;
                    int placedX = Math.Max(margin, Math.Min(localX, cellSize - margin - spriteWidth));
                    int placedY = Math.Max(margin, Math.Min(localY, cellSize - margin - spriteHeight));
                    int shiftX = column * cellSize + placedX - component.MinX;
                    int shiftY = row * cellSize + placedY - component.MinY;

                    foreach (int sourceIndex in component.Pixels)
                    {
                        int sourceX = sourceIndex % width;
                        int sourceY = sourceIndex / width;
                        int targetX = sourceX + shiftX;
                        int targetY = sourceY + shiftY;
                        int sourceOffset = sourceY * stride + sourceX * 4;
                        int targetOffset = targetY * targetData.Stride + targetX * 4;
                        targetBytes[targetOffset] = sourceBytes[sourceOffset];
                        targetBytes[targetOffset + 1] = sourceBytes[sourceOffset + 1];
                        targetBytes[targetOffset + 2] = sourceBytes[sourceOffset + 2];
                        targetBytes[targetOffset + 3] = sourceBytes[sourceOffset + 3];
                    }

                    report.Add(string.Format(
                        "frame={0:D2} source={1},{2},{3},{4} placed={5},{6} shift={7},{8} area={9}",
                        frame, component.MinX, component.MinY, spriteWidth, spriteHeight,
                        placedX, placedY, shiftX, shiftY, component.Area));
                }

                Marshal.Copy(targetBytes, 0, targetData.Scan0, targetBytes.Length);
                target.UnlockBits(targetData);
                target.Save(outputPath, ImageFormat.Png);
                return string.Join(Environment.NewLine, report);
            }
        }
    }
}
'@

$inputFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $InputPath))
$outputFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputFullPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

[SpriteSheetRepacker]::Repack($inputFullPath, $outputFullPath, $CellSize, $GridSize, $Margin)
