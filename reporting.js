function openReportGenerator() {
    let $repgen = $("<div>")
        .html(`
        <div id="PowerupReportGeneratorTitleBar"><h3>Generate Report</h3></div>
        <div id="PowerupReportGeneratorPreview"></div>
        <div id="PowerupReportGeneratorButtonBar"></div>
        `)
        .addClass("PowerupReportGenerator")
        .appendTo("body");
    let $buttonBar = $repgen.find(`#PowerupReportGeneratorButtonBar`);

    let $cancel = $(`<button type="button">`)
        .on('click', closeReportGenerator)
        .text("Cancel")
        .addClass("powerupButton")
        .appendTo($buttonBar);

    let $generate = $(`<button type="button" id="generateReportButton">`)
        .on('click', generateReport)
        .text("Generate")
        .addClass("powerupButton")
        .appendTo($buttonBar);
}

function closeReportGenerator() {
    $("div.PowerupReportGenerator").remove();
}

function generateReport() {
    $(`#generateReportButton`).hide();
    let $preview = $(`#PowerupReportGeneratorPreview`);
    let $buttonBar = $(`#PowerupReportGeneratorButtonBar`);

    (function (H) {
        // adapted from https://jsfiddle.net/gh/get/library/pure/highcharts/highcharts/tree/master/samples/highcharts/exporting/multiple-charts-offline/

        let getSVG = function (charts, options, callback) {
            const space = 10;
            let svgArr = [],
                top = 0,
                width = 0,
                addSVG = function (svgres) {
                    // Grab width/height from exported chart
                    let svgWidth = +svgres.match(
                        /^<svg[^>]*width\s*=\s*\"?(\d+)\"?[^>]*>/
                    )[1],
                        svgHeight = +svgres.match(
                            /^<svg[^>]*height\s*=\s*\"?(\d+)\"?[^>]*>/
                        )[1],
                        // Offset the position of this chart in the final SVG
                        svg = svgres.replace('<svg', '<g transform="translate(0,' + top + ')" ');
                    svg = svg.replace('</svg>', '</g>');
                    top += svgHeight + space;
                    width = Math.max(width, svgWidth);
                    svgArr.push(svg);
                },
                previewSVG = function (svg) {
                    let p = $.Deferred();
                    $preview.html(svg);
                    let $next = $(`<button type="button" id="generateReportNextButton">`)
                        .on('click', () => {
                            $preview.html();
                            p.resolve();
                        })
                        .text("Next")
                        .addClass("powerupButton")
                        .appendTo($buttonBar);
                    return(p);
                },
                exportChart = function (i) {
                    if (i === charts.length) {
                        return callback('<svg height="' + top + '" width="' + width +
                            '" version="1.1" xmlns="http://www.w3.org/2000/svg">' + svgArr.join('') + '</svg>');
                    }
                    let chartOptions = {
                        chart: {
                            borderColor: "#e6e6e6",
                            borderWidth: "1px"
                        }
                    };
                    //Dynatrace charts don't set the title, get it and set it
                    let $chart = $(charts[i].container);
                    let $tile = $chart.parents(DashboardPowerups.SELECTORS.TILE_SELECTOR);
                    let $title = $tile.find(DashboardPowerups.SELECTORS.TITLE_SELECTOR);
                    let title = $title.text();
                    let idx = title.length;

                    //remove markers from title using string manipulation instead of regex to avoid excessive escaping
                    idx = DashboardPowerups.MARKERS.reduce((acc, marker) =>
                    (title.includes(marker) ?
                        Math.min(title.indexOf(marker), acc) :
                        Math.min(acc, idx))
                        , idx);
                    title = title.substring(0, idx)

                    if (typeof (title) != "undefined" && title.length)
                        chartOptions.title = {
                            text: title,
                            align: "left",
                            style: {
                                color: "#454646",
                                fontSize: "12px"
                            }
                        }


                    charts[i].getSVGForLocalExport(options, chartOptions, function () {
                        console.log("Failed to get SVG");
                    }, async function (svg) {
                        await previewSVG(svg);
                        addSVG(svg);
                        return exportChart(i + 1); // Export next only when this SVG is received
                    });
                };
            exportChart(0);
        };

        let exportCharts = function (charts, options) {
            options = Highcharts.merge(Highcharts.getOptions().exporting, options);

            // Get SVG asynchronously and then download the resulting SVG
            getSVG(charts, options, function (svg) {
                Highcharts.downloadSVGLocal(svg, options, function () {
                    console.log("Failed to export on client side");
                });
            });
        };

        // Set global default options for all charts
        Highcharts.setOptions({
            exporting: {
                fallbackToExportServer: false // Ensure the export happens on the client side or not at all
            }
        });


        //get all the charts and export as PDF
        let charts = H.charts.filter(x => typeof (x) != "undefined");
        exportCharts(charts,
            {
                type: 'application/pdf',
                libURL: DashboardPowerups.POWERUP_EXT_URL + '3rdParty/Highcharts/lib'
            })

    }(Highcharts));
}