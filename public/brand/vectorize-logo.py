from PIL import Image
import numpy as np
from pathlib import Path

root = Path(__file__).parent
im = Image.open(root / 'zentra-logo-v1.png').convert('RGBA')
a = np.array(im)
mask = (a[:, :, 3] > 128) & (a[:, :, 0] > 150) & (a[:, :, 1] < 120)
edges = {}
for y, x in zip(*np.nonzero(mask)):
  for start, end, exposed in [((x,y),(x+1,y),y == 0 or not mask[y-1,x]), ((x+1,y),(x+1,y+1),x == mask.shape[1]-1 or not mask[y,x+1]), ((x+1,y+1),(x,y+1),y == mask.shape[0]-1 or not mask[y+1,x]), ((x,y+1),(x,y),x == 0 or not mask[y,x-1])]:
    if exposed:
      edges.setdefault(start, []).append(end)

def simplify(points, epsilon=1.3):
  if len(points) < 3:
    return points
  p = np.array(points, dtype=float)
  v = p[-1] - p[0]
  length = np.linalg.norm(v)
  distances = np.abs(v[0]*(p[:,1]-p[0,1])-v[1]*(p[:,0]-p[0,0]))/length if length else np.linalg.norm(p-p[0],axis=1)
  i = int(np.argmax(distances))
  if distances[i] > epsilon:
    return simplify(points[:i+1],epsilon)[:-1] + simplify(points[i:],epsilon)
  return [points[0],points[-1]]

paths = []
while edges:
  start = next(iter(edges))
  points = [start]
  current = start
  while current in edges:
    nxt = edges[current].pop()
    if not edges[current]:
      del edges[current]
    points.append(nxt)
    current = nxt
    if current == start:
      break
  area = abs(sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(points,points[1:])))/2
  if area < 100:
    continue
  mid = len(points)//2
  points = simplify(points[:mid+1])[:-1] + simplify(points[mid:])
  paths.append('M'+' L'.join(f'{x},{y}' for x,y in points)+' Z')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {im.width} {im.height}" role="img" aria-labelledby="title"><title id="title">Zentra</title><path fill="#fd1669" fill-rule="evenodd" d="{" ".join(paths)}"/></svg>\n'
(root / 'zentra-logo-v1.svg').write_text(svg)
print(f'Saved vector logo with {len(paths)} contours')
