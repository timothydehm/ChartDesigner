document.addEventListener('DOMContentLoaded', () => {
    const chartTypeSelect = document.getElementById('chartType');
    const dataInput = document.getElementById('dataInput');
    const generateBtn = document.getElementById('generateBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const chartContainer = document.getElementById('chart-container');
    const errorMessage = document.getElementById('error-message');

    generateBtn.addEventListener('click', generateChart);
    downloadBtn.addEventListener('click', downloadSVG);

    function clearChart() {
        chartContainer.innerHTML = ''; // Clear previous SVG
        errorMessage.textContent = ''; // Clear previous errors
        downloadBtn.style.display = 'none'; // Hide download button
    }

    function displayError(message) {
        errorMessage.textContent = `Error: ${message}`;
        console.error(message);
    }

    function parseData() {
        try {
            const data = JSON.parse(dataInput.value.trim());
            if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                 throw new Error("Input must be a JSON object (e.g., {\"Room\": {\"Item\": Count}})");
            }
            // Basic validation: ensure values are objects with numbers
             for (const room in data) {
                if (typeof data[room] !== 'object' || data[room] === null) {
                     throw new Error(`Value for room "${room}" must be an object.`);
                }
                 for (const item in data[room]) {
                     if (typeof data[room][item] !== 'number' || !Number.isInteger(data[room][item]) || data[room][item] < 0) {
                         throw new Error(`Count for "${item}" in "${room}" must be a non-negative integer.`);
                     }
                 }
             }
            return data;
        } catch (e) {
            displayError(`Invalid JSON data. ${e.message}`);
            return null;
        }
    }

    function generateChart() {
        clearChart();
        const data = parseData();
        if (!data) return; // Stop if data parsing failed

        const chartType = chartTypeSelect.value;
        const rooms = Object.keys(data);

        if (rooms.length === 0) {
            displayError("No data provided in the JSON object.");
            return;
        }

        // --- D3 Setup ---
        const containerWidth = chartContainer.clientWidth || 600; // Get width or default
        const margin = { top: 40, right: 30, bottom: 70, left: 60 }; // Increased bottom for labels
        const width = containerWidth - margin.left - margin.right;
        // Adjust height based on number of rooms for bar charts to prevent squishing
        const baseHeight = 300;
        const heightPerRoom = 20;
        const calculatedHeight = Math.max(baseHeight, rooms.length * heightPerRoom);
        const height = calculatedHeight + margin.top + margin.bottom; // Add dynamic height

        const svg = d3.select("#chart-container")
            .append("svg")
              .attr("width", containerWidth) // Use container width
              .attr("height", height) // Use calculated height
              .attr("viewBox", `0 0 ${containerWidth} ${height}`) // Make responsive
              .attr("preserveAspectRatio", "xMidYMid meet")
            .append("g")
              .attr("transform", `translate(${margin.left},${margin.top})`);


        // --- Chart Type Logic ---
        try {
             if (chartType === 'barTotal') {
                 createBarTotalChart(svg, data, width, calculatedHeight, margin); // Pass calculated height
             } else if (chartType === 'barBreakdown') {
                 createStackedBarChart(svg, data, width, calculatedHeight, margin); // Pass calculated height
             } else {
                 displayError("Selected chart type not implemented yet.");
                 return; // Stop if type unknown
             }

             // Show download button if successful
             downloadBtn.style.display = 'block';

        } catch (error) {
            displayError(`Chart generation failed: ${error.message}`);
            console.error(error);
            clearChart(); // Clear potentially broken chart
        }
    }


    // --- Chart Generation Functions ---

    function createBarTotalChart(svg, data, width, height, margin) {
        const rooms = Object.keys(data);
        const totals = rooms.map(room => d3.sum(Object.values(data[room])));

        // --- Scales ---
        const xScale = d3.scaleBand()
            .domain(rooms)
            .range([0, width])
            .padding(0.2); // Padding between bars

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(totals) || 1]) // Use max total or 1 if all are 0
            .range([height, 0]); // Inverted: 0 is at the top

        // --- Axes ---
        const xAxis = d3.axisBottom(xScale);
        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text") // Style axis labels
                .attr("transform", "rotate(-45)")
                .style("text-anchor", "end")
                .attr("dx", "-.8em")
                .attr("dy", ".15em");


        const yAxis = d3.axisLeft(yScale);
        svg.append("g")
            .call(yAxis);

        // --- Add Y Axis Gridlines (Optional) ---
        svg.append("g")
            .attr("class", "grid")
            .call(d3.axisLeft(yScale)
                .ticks(5) // Suggest number of ticks
                .tickSize(-width)
                .tickFormat("")
            );

        // --- Bars ---
        svg.selectAll(".bar")
            .data(rooms)
            .enter()
            .append("rect")
                .attr("class", "bar")
                .attr("x", d => xScale(d))
                .attr("y", d => yScale(d3.sum(Object.values(data[d]))))
                .attr("width", xScale.bandwidth())
                .attr("height", d => height - yScale(d3.sum(Object.values(data[d]))));

        // --- Add value labels on top of bars (Optional) ---
        svg.selectAll(".value-label")
            .data(rooms)
            .enter()
            .append("text")
                .attr("class", "value-label")
                .attr("x", d => xScale(d) + xScale.bandwidth() / 2)
                .attr("y", d => yScale(d3.sum(Object.values(data[d]))) - 5) // 5px above bar
                .text(d => d3.sum(Object.values(data[d])));


        // --- Add Titles/Labels ---
        svg.append("text") // Chart Title
            .attr("class", "chart-title")
            .attr("x", width / 2)
            .attr("y", 0 - (margin.top / 2)) // Position above chart area
            .text("Total Items per Room");

        svg.append("text") // X Axis Label
            .attr("class", "axis-label")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom - 10) // Position below rotated labels
            .text("Room");

        svg.append("text") // Y Axis Label
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left + 15)
            .attr("x", 0 - (height / 2))
            .text("Total Items");
    }


    function createStackedBarChart(svg, data, width, height, margin) {
        const rooms = Object.keys(data);

        // Get all unique item types (keys for stacking)
        const itemTypes = [...new Set(rooms.flatMap(room => Object.keys(data[room])))].sort();

        // Prepare data for D3 stack layout
        // Need an array of objects, where each object represents a room
        // and has properties for each itemType count.
        const stackedData = rooms.map(room => {
            const roomData = { room: room }; // Keep track of the room name
            itemTypes.forEach(type => {
                roomData[type] = data[room][type] || 0; // Use 0 if item type not in room
            });
            return roomData;
        });

        // --- Stack Generator ---
        const stack = d3.stack()
            .keys(itemTypes); // Keys tell stack which properties to use for layers

        const series = stack(stackedData); // Generate stack layers [[y0, y1], ...]

        // --- Scales ---
        const xScale = d3.scaleBand()
            .domain(rooms)
            .range([0, width])
            .padding(0.2);

        const yScale = d3.scaleLinear()
            // Max Y is the sum of items in the 'tallest' stacked bar
            .domain([0, d3.max(series, layer => d3.max(layer, d => d[1])) || 1])
            .range([height, 0]);

        // --- Color Scale ---
        // Use a built-in D3 color scheme or define your own array
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
            .domain(itemTypes);

        // --- Axes ---
        const xAxis = d3.axisBottom(xScale);
        svg.append("g")
           .attr("transform", `translate(0,${height})`)
           .call(xAxis)
           .selectAll("text")
               .attr("transform", "rotate(-45)")
               .style("text-anchor", "end")
               .attr("dx", "-.8em")
               .attr("dy", ".15em");

        const yAxis = d3.axisLeft(yScale);
        svg.append("g")
           .call(yAxis);

        // --- Add Y Axis Gridlines (Optional) ---
        svg.append("g")
            .attr("class", "grid")
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-width)
                .tickFormat("")
            );

        // --- Draw Stacked Bars ---
        // Create groups for each series (item type)
        const layers = svg.selectAll(".layer")
            .data(series)
            .enter()
            .append("g")
                .attr("class", "layer")
                .attr("fill", d => colorScale(d.key)); // Color by item type (d.key)

        // Add rects to each layer group
        layers.selectAll("rect")
            .data(d => d) // Bind the inner array (data for each room in this layer)
            .enter()
            .append("rect")
                .attr("x", d => xScale(d.data.room)) // Get room name from original data obj
                .attr("y", d => yScale(d[1]))      // d[1] is the top y-value
                .attr("width", xScale.bandwidth())
                .attr("height", d => yScale(d[0]) - yScale(d[1])); // Height is diff between bottom & top y

        // --- Add Legend (Simple Example) ---
        const legend = svg.selectAll(".legend")
            .data(itemTypes)
            .enter()
            .append("g")
                .attr("class", "legend")
                // Position legend - adjust as needed
                .attr("transform", (d, i) => `translate(0, ${i * 20})`);

        legend.append("rect")
            .attr("x", width + 5) // Position to the right of the chart
            .attr("width", 18)
            .attr("height", 18)
            .style("fill", colorScale);

        legend.append("text")
            .attr("x", width + 30) // Text next to the color swatch
            .attr("y", 9)
            .attr("dy", ".35em")
            .style("text-anchor", "start")
            .style("font-size", "12px")
            .text(d => d);


        // --- Add Titles/Labels ---
        svg.append("text") // Chart Title
           .attr("class", "chart-title")
           .attr("x", width / 2)
           .attr("y", 0 - (margin.top / 2))
           .text("Item Breakdown per Room");

        svg.append("text") // X Axis Label
            .attr("class", "axis-label")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom - 10)
            .text("Room");

        svg.append("text") // Y Axis Label
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left + 15)
            .attr("x", 0 - (height / 2))
            .text("Item Count");
    }


    // --- Download Functionality ---
    function downloadSVG() {
        const svgElement = chartContainer.querySelector('svg');
        if (!svgElement) {
            displayError("No chart found to download.");
            return;
        }

        // Serialize the SVG to a string
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgElement);

        // Optional: Add XML declaration and DOCTYPE for better compatibility
        svgString = '<?xml version="1.0" standalone="no"?>\r\n' + svgString;
        // Note: Adding <!DOCTYPE svg PUBLIC ...> might be more correct but can sometimes cause issues. Test if needed.

        // Create a Blob (Binary Large Object)
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

        // Create a URL for the Blob
        const url = URL.createObjectURL(blob);

        // Create a temporary link element
        const link = document.createElement('a');
        link.href = url;
        link.download = `inventory-chart-${chartTypeSelect.value}.svg`; // Dynamic filename

        // Programmatically click the link to trigger download
        document.body.appendChild(link); // Required for Firefox
        link.click();

        // Clean up: remove link and revoke Blob URL
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
});
