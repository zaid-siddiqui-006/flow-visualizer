// Flow Visualizer
// This file contains the flow presets, particle calculations and drawing code.

const presets = {
  shear: {
    name: "Pulsating shear",
    u: "-a*(1-y/2)+b*sin(w*t)",
    v: "c*(0.3+0.3*sin(w*t))",
    parameters: { a: 1.5, b: 2, c: 1, w: 2.5 },
    domain: [-2, 4, 0, 2], release: [1, 0.1], endTime: 6
  },
  vortex: {
    name: "Steady vortex (all three lines coincide)",
    u: "-a*(y-1)", v: "a*(x-1)",
    parameters: { a: 1, b: 0, c: 0, w: 0 },
    domain: [-1, 3, -1, 3], release: [2, 1], endTime: 5
  },
  uvortex: {
    name: "Unsteady vortex with oscillating drift",
    u: "-a*(y-1)+b*sin(w*t)", v: "a*(x-1)",
    parameters: { a: 1, b: 1.5, c: 0, w: 2 },
    domain: [-2, 4, -2, 4], release: [2, 1], endTime: 8
  },
  saddle: {
    name: "Saddle / stagnation point",
    u: "a*(x-1)", v: "-a*(y-1)",
    parameters: { a: 0.5, b: 0, c: 0, w: 0 },
    domain: [-1, 3, -1, 3], release: [0.4, 2.6], endTime: 4
  },
  wave: {
    name: "Travelling wave on uniform stream",
    u: "a", v: "b*sin(c*x-w*t)",
    parameters: { a: 1, b: 1, c: 2, w: 3 },
    domain: [0, 8, -2, 2], release: [0, 0], endTime: 6
  },
  source: {
    name: "Pulsating source in uniform stream",
    u: "a+b*(1+0.5*sin(w*t))*x/(x*x+y*y+0.05)",
    v: "b*(1+0.5*sin(w*t))*y/(x*x+y*y+0.05)",
    parameters: { a: 1, b: 1.5, c: 0, w: 3 },
    domain: [-3, 3, -3, 3], release: [-2.5, 0.5], endTime: 5
  },
  decay: {
    name: "Decaying shear with swirl",
    u: "a*y*exp(-c*t)", v: "b*sin(w*t)*(1-x/4)",
    parameters: { a: 2, b: 1, c: 0.2, w: 2 },
    domain: [-1, 5, 0, 3], release: [1, 0.5], endTime: 7
  },
  stokes: {
    name: "Stokes layer: oscillating wall (u only)",
    u: "a*exp(-y*sqrt(abs(w)/2))*cos(w*t-y*sqrt(abs(w)/2))",
    v: "0",
    parameters: { a: 2, b: 0, c: 0, w: 3 },
    domain: [-2, 4, 0, 3], release: [1, 0.3], endTime: 6
  },
  expand: {
    name: "Expanding flow",
    u: "x/(1+a*t)", v: "b*y",
    parameters: { a: 1, b: 0.5, c: 0, w: 0 },
    domain: [0, 6, 0, 6], release: [1, 1], endTime: 3
  }
};

const parameterNames = ["a", "b", "c", "w"];
const parameterValues = { a: 0, b: 0, c: 0, w: 0 };
const element = (id) => document.getElementById(id);

const canvas = element("plot");
const context = canvas.getContext("2d");

let velocityU;
let velocityV;
let previousU = "";
let previousV = "";
let animationFrame = null;

// Build the preset menu and parameter sliders.
function createControls() {
  const presetMenu = element("preset");

  Object.entries(presets).forEach(([key, preset]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = preset.name;
    presetMenu.appendChild(option);
  });

  const parameterBox = element("parameters");

  parameterNames.forEach((name) => {
    const row = document.createElement("div");
    row.className = "parameter-row";
    row.innerHTML = `
      <strong>${name}</strong>
      <input type="range" id="parameter-${name}" min="-5" max="5" step="0.1">
      <output id="value-${name}">0</output>
    `;
    parameterBox.appendChild(row);
  });
}

// Compile the user-entered velocity expressions.
// Expressions are intended for maths input, not untrusted code.
function makeExpression(expression) {
  const cleanedExpression = expression.replace(/\^/g, "**");

  return new Function(
    "x", "y", "t", "a", "b", "c", "w",
    `with (Math) { return (${cleanedExpression}); }`
  );
}

function readParameters() {
  parameterNames.forEach((name) => {
    const value = Number(element(`parameter-${name}`).value);
    parameterValues[name] = value;
    element(`value-${name}`).textContent = value.toFixed(1);
  });
}

function velocity(x, y, time) {
  return [
    velocityU(x, y, time, ...parameterNames.map((name) => parameterValues[name])),
    velocityV(x, y, time, ...parameterNames.map((name) => parameterValues[name]))
  ];
}

// Fourth-order Runge-Kutta integration.
function rungeKuttaStep(field, x, y, time, stepSize) {
  const k1 = field(x, y, time);
  const k2 = field(
    x + stepSize * k1[0] / 2,
    y + stepSize * k1[1] / 2,
    time + stepSize / 2
  );
  const k3 = field(
    x + stepSize * k2[0] / 2,
    y + stepSize * k2[1] / 2,
    time + stepSize / 2
  );
  const k4 = field(
    x + stepSize * k3[0],
    y + stepSize * k3[1],
    time + stepSize
  );

  return [
    x + stepSize * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]) / 6,
    y + stepSize * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]) / 6
  ];
}

function integrateParticle(x, y, startTime, endTime, steps) {
  if (endTime <= startTime) return [[x, y]];

  const stepSize = (endTime - startTime) / steps;
  const points = [[x, y]];

  for (let i = 0; i < steps; i += 1) {
    [x, y] = rungeKuttaStep(
      velocity, x, y, startTime + i * stepSize, stepSize
    );

    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
    points.push([x, y]);
  }

  return points;
}

function getNumber(id) {
  return Number(element(id).value);
}

function getThemeColor(variable) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable).trim();
}

function drawLine(points, color, width, mapX, mapY) {
  if (points.length < 2) return;

  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = width;

  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(mapX(x), mapY(y));
    else context.lineTo(mapX(x), mapY(y));
  });

  context.stroke();
}

function drawAxes(width, height, left, top, plotWidth, plotHeight,
                  minX, maxX, minY, maxY, mapX, mapY) {
  const border = getThemeColor("--border");
  const muted = getThemeColor("--muted");

  context.strokeStyle = border;
  context.fillStyle = muted;
  context.lineWidth = 1;
  context.strokeRect(left, top, plotWidth, plotHeight);

  const tickStep = (range) => {
    const raw = range / 6;
    const power = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / power;
    const factor = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10;
    return factor * power;
  };

  const xStep = tickStep(maxX - minX);
  const yStep = tickStep(maxY - minY);

  context.font = "12px system-ui";
  context.textAlign = "center";
  context.textBaseline = "top";

  for (let value = Math.ceil(minX / xStep) * xStep; value <= maxX; value += xStep) {
    const x = mapX(value);
    context.beginPath();
    context.moveTo(x, top + plotHeight);
    context.lineTo(x, top + plotHeight + 4);
    context.stroke();
    context.fillText(Number(value.toFixed(3)), x, top + plotHeight + 6);
  }

  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let value = Math.ceil(minY / yStep) * yStep; value <= maxY; value += yStep) {
    const y = mapY(value);
    context.beginPath();
    context.moveTo(left - 4, y);
    context.lineTo(left, y);
    context.stroke();
    context.fillText(Number(value.toFixed(3)), left - 7, y);
  }

  context.fillStyle = getThemeColor("--text");
  context.font = "italic 15px Georgia";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText("x", left + plotWidth / 2, height - 8);

  context.save();
  context.translate(14, top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.fillText("y", 0, 0);
  context.restore();
}

function drawVelocityVectors(minX, maxX, minY, maxY, time, mapX, mapY,
                              plotWidth, plotHeight) {
  const columns = 36;
  const rows = Math.max(8, Math.round(columns * plotHeight / plotWidth));
  const vectors = [];
  let maximumSpeed = 0;

  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const x = minX + (i + 0.5) / columns * (maxX - minX);
      const y = minY + (j + 0.5) / rows * (maxY - minY);
      const [u, v] = velocity(x, y, time);
      const speed = Math.hypot(u, v);

      if (Number.isFinite(speed)) {
        vectors.push({ x, y, u, v, speed });
        maximumSpeed = Math.max(maximumSpeed, speed);
      }
    }
  }

  if (maximumSpeed === 0) return;

  const cellSize = Math.min(plotWidth / columns, plotHeight / rows) * 1.6;

  vectors.forEach(({ x, y, u, v, speed }) => {
    if (speed < 1e-9) return;

    const directionX = u / speed;
    const directionY = -v / speed;
    const length = cellSize * speed / maximumSpeed;
    const centerX = mapX(x);
    const centerY = mapY(y);
    const endX = centerX + directionX * length / 2;
    const endY = centerY + directionY * length / 2;
    const startX = centerX - directionX * length / 2;
    const startY = centerY - directionY * length / 2;
    const head = Math.min(5, length * 0.4);

    context.strokeStyle = `hsl(${210 - 210 * speed / maximumSpeed}, 75%, 48%)`;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.lineTo(
      endX - head * (directionX * 0.9 - directionY * 0.4),
      endY - head * (directionY * 0.9 + directionX * 0.4)
    );
    context.moveTo(endX, endY);
    context.lineTo(
      endX - head * (directionX * 0.9 + directionY * 0.4),
      endY - head * (directionY * 0.9 - directionX * 0.4)
    );
    context.stroke();
  });
}

function drawStreamline(x0, y0, time, minX, maxX, minY, maxY, mapX, mapY) {
  const stepSize = (maxX - minX) / 300;
  const directionField = (x, y) => {
    const [u, v] = velocity(x, y, time);
    const speed = Math.hypot(u, v);
    return speed > 1e-12 ? [u / speed, v / speed] : [0, 0];
  };

  [1, -1].forEach((direction) => {
    let x = x0;
    let y = y0;
    const points = [[x, y]];

    for (let i = 0; i < 2500; i += 1) {
      [x, y] = rungeKuttaStep(
        (px, py) => directionField(px, py),
        x, y, 0, direction * stepSize
      );

      if (!Number.isFinite(x) || !Number.isFinite(y)) break;
      if (x < minX - 1 || x > maxX + 1 || y < minY - 1 || y > maxY + 1) break;
      points.push([x, y]);
    }

    drawLine(points, getThemeColor("--streamline"), 2.2, mapX, mapY);
  });
}

function drawLegend(left, top) {
  const entries = [
    ["Velocity", getThemeColor("--velocity")],
    ["Pathline", getThemeColor("--pathline")],
    ["Streakline", getThemeColor("--streakline")],
    ["Streamline", getThemeColor("--streamline")]
  ];

  const boxWidth = 125;
  const boxHeight = entries.length * 20 + 12;
  const x = left - boxWidth - 8;
  const y = top + 8;

  context.fillStyle = getThemeColor("--panel");
  context.globalAlpha = 0.92;
  context.fillRect(x, y, boxWidth, boxHeight);
  context.globalAlpha = 1;
  context.strokeStyle = getThemeColor("--border");
  context.strokeRect(x, y, boxWidth, boxHeight);

  context.font = "12px system-ui";
  context.textAlign = "left";
  context.textBaseline = "middle";

  entries.forEach(([name, color], index) => {
    const lineY = y + 16 + index * 20;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 8, lineY);
    context.lineTo(x + 30, lineY);
    context.stroke();
    context.fillStyle = getThemeColor("--text");
    context.fillText(name, x + 36, lineY);
  });
}

function draw() {
  readParameters();
  const time = getNumber("time");
  element("timeValue").textContent = time.toFixed(2);

  try {
    const uText = element("u").value.trim();
    const vText = element("v").value.trim();

    if (!uText || !vText) throw new Error("Enter both velocity expressions.");

    if (uText !== previousU || vText !== previousV) {
      velocityU = makeExpression(uText);
      velocityV = makeExpression(vText);
      velocity(1, 1, 1);
      previousU = uText;
      previousV = vText;
    }

    element("errorMessage").textContent = "";
  } catch (error) {
    element("errorMessage").textContent = `Expression error: ${error.message}`;
    return;
  }

  const minX = getNumber("xmin");
  const maxX = getNumber("xmax");
  const minY = getNumber("ymin");
  const maxY = getNumber("ymax");

  if (!(maxX > minX && maxY > minY)) {
    element("errorMessage").textContent = "Check the domain limits.";
    return;
  }

  const x0 = getNumber("x0");
  const y0 = getNumber("y0");
  const startTime = Math.min(getNumber("t0"), time);
  const particleCount = Math.max(5, Math.min(300, getNumber("particleCount") || 60));

  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(520, canvas.parentElement.clientWidth);
  const plotHeightEstimate = width * (maxY - minY) / (maxX - minX);
  const height = Math.round(Math.min(Math.max(plotHeightEstimate, 260), width * 0.8) + 90);

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const left = 58;
  const right = 16;
  const top = 16;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const mapX = (x) => left + (x - minX) / (maxX - minX) * plotWidth;
  const mapY = (y) => top + plotHeight - (y - minY) / (maxY - minY) * plotHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = getThemeColor("--panel");
  context.fillRect(0, 0, width, height);

  drawAxes(width, height, left, top, plotWidth, plotHeight,
           minX, maxX, minY, maxY, mapX, mapY);

  context.save();
  context.beginPath();
  context.rect(left, top, plotWidth, plotHeight);
  context.clip();

  if (element("showVelocity").checked) {
    drawVelocityVectors(minX, maxX, minY, maxY, time,
                        mapX, mapY, plotWidth, plotHeight);
  }

  if (element("showStreamline").checked) {
    drawStreamline(x0, y0, time, minX, maxX, minY, maxY, mapX, mapY);
  }

  if (element("showPathline").checked) {
    const path = integrateParticle(
      x0, y0, startTime, time,
      Math.min(400, Math.max(20, Math.ceil((time - startTime) * 40)))
    );
    drawLine(path, getThemeColor("--pathline"), 2.4, mapX, mapY);

    const lastPoint = path[path.length - 1];
    context.fillStyle = getThemeColor("--pathline");
    context.beginPath();
    context.arc(mapX(lastPoint[0]), mapY(lastPoint[1]), 5, 0, Math.PI * 2);
    context.fill();
  }

  if (element("showStreakline").checked) {
    const streak = [];

    for (let i = 0; i <= particleCount; i += 1) {
      const releaseTime = startTime + (time - startTime) * i / particleCount;
      const particlePath = integrateParticle(
        x0, y0, releaseTime, time,
        Math.max(6, Math.min(240, Math.ceil(30 * (time - releaseTime))))
      );
      streak.push(particlePath[particlePath.length - 1]);
    }

    drawLine(streak, getThemeColor("--streakline"), 2, mapX, mapY);

    streak.forEach(([x, y]) => {
      context.strokeStyle = getThemeColor("--streakline");
      context.lineWidth = 1.5;
      context.strokeRect(mapX(x) - 3, mapY(y) - 3, 6, 6);
    });
  }

  context.fillStyle = getThemeColor("--text");
  context.beginPath();
  context.arc(mapX(x0), mapY(y0), 3.5, 0, Math.PI * 2);
  context.fill();
  context.restore();

  drawLegend(left + plotWidth, top);
}

function loadPreset(name) {
  const preset = presets[name];

  element("u").value = preset.u;
  element("v").value = preset.v;

  parameterNames.forEach((parameter) => {
    element(`parameter-${parameter}`).value = preset.parameters[parameter];
  });

  ["xmin", "xmax", "ymin", "ymax"].forEach((id, index) => {
    element(id).value = preset.domain[index];
  });

  element("x0").value = preset.release[0];
  element("y0").value = preset.release[1];
  element("t0").value = 0;
  element("particleCount").value = 60;
  element("time").value = 0;
  element("time").max = Math.max(20, preset.endTime);
  element("exportedImage").style.display = "none";
  element("exportNote").classList.add("hidden");

  previousU = "";
  previousV = "";
  draw();
}

function stopAnimation() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  element("playButton").textContent = "▶ Animate T";
}

function toggleAnimation() {
  if (animationFrame !== null) {
    stopAnimation();
    return;
  }

  element("playButton").textContent = "❚❚ Pause";
  let previousFrameTime = performance.now();

  function animate(currentTime) {
    const elapsed = Math.min(currentTime - previousFrameTime, 50) / 1000;
    previousFrameTime = currentTime;

    const timeInput = element("time");
    let nextTime = Number(timeInput.value) + elapsed * 1.2;

    if (nextTime > Number(timeInput.max)) nextTime = 0;
    timeInput.value = nextTime;

    draw();
    animationFrame = requestAnimationFrame(animate);
  }

  animationFrame = requestAnimationFrame(animate);
}

function exportPlot() {
  draw();
  const image = element("exportedImage");
  image.src = canvas.toDataURL("image/png");
  image.style.display = "block";
  element("exportNote").classList.remove("hidden");
  image.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setExplanationLanguage(language) {
  const showEnglish = language === "english";

  element("englishExplanation").classList.toggle("hidden", !showEnglish);
  element("hinglishExplanation").classList.toggle("hidden", showEnglish);

  element("englishButton").classList.toggle("active", showEnglish);
  element("hinglishButton").classList.toggle("active", !showEnglish);

  element("englishButton").setAttribute("aria-pressed", String(showEnglish));
  element("hinglishButton").setAttribute("aria-pressed", String(!showEnglish));
}

function setUpEvents() {
  element("preset").addEventListener("change", (event) => {
    loadPreset(event.target.value);
  });
  element("resetButton").addEventListener("click", () => {
    loadPreset(element("preset").value);
  });
  element("themeButton").addEventListener("click", () => {
    const root = document.documentElement;
    const currentTheme = root.dataset.theme ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.dataset.theme = currentTheme === "dark" ? "light" : "dark";
    draw();
  });
  element("playButton").addEventListener("click", toggleAnimation);
  element("exportButton").addEventListener("click", exportPlot);

  element("englishButton").addEventListener("click", () => {
    setExplanationLanguage("english");
  });
  element("hinglishButton").addEventListener("click", () => {
    setExplanationLanguage("hinglish");
  });

  const inputIds = [
    "u", "v", "x0", "y0", "t0", "particleCount", "time",
    "xmin", "xmax", "ymin", "ymax",
    "showVelocity", "showPathline", "showStreakline", "showStreamline",
    ...parameterNames.map((name) => `parameter-${name}`)
  ];

  inputIds.forEach((id) => {
    element(id).addEventListener("input", draw);
    element(id).addEventListener("change", draw);
  });

  window.addEventListener("resize", draw);
}

createControls();
setUpEvents();
loadPreset("shear");
