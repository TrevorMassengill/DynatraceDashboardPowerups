/*
Copyright 2020 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/
var PowerupReporting = (function () {

    //Public methods
    var pub = {};

    pub.openReportGenerator = () => {
        $(`.PowerupReportGenerator`).remove(); //remove any stragglers

        let $repgen = $("<div>")
            .html(`
        <div id="PowerupReportGeneratorTitleBar"><h3>Generate Report</h3></div>
        <div id="PowerupReportGeneratorPreview">
            <div id="PowerupReportGeneratorPreviewTitle"></div>
            <div id="PowerupReportGeneratorPreviewContent"></div>
            <div id="PowerupReportGeneratorPreviewOptions"></div>
        </div>
        <div id="PowerupReportGeneratorHiddenCopy"></div>
        <div id="PowerupReportGeneratorButtonBar"></div>
        `)
            .addClass("PowerupReportGenerator")
            .appendTo("body");
        let $buttonBar = $repgen.find(`#PowerupReportGeneratorButtonBar`);


        let $cancel = $(`<button type="button" id="cancelReportButton">`)
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
        $(`#PowerupReportGeneratorPreviewOptions`).show();
        let $previewContent = $(`#PowerupReportGeneratorPreviewContent`);
        let $previewTitle = $(`#PowerupReportGeneratorPreviewTitle`);
        let $previewOptions = $(`#PowerupReportGeneratorPreviewOptions`);
        let $buttonBar = $(`#PowerupReportGeneratorButtonBar`);
        let $copies = $(`#PowerupReportGeneratorHiddenCopy`);

        (function (H) {

            // adapted from https://jsfiddle.net/gh/get/library/pure/H/H/tree/master/samples/H/exporting/multiple-charts-offline/
            let copyChart = function (chart, chartOptions, containerContainer) {
                if (!Object.keys(chart).length) return null;
                let chartCopy,
                    sandbox,
                    svg,
                    seriesOptions,
                    sourceWidth,
                    sourceHeight,
                    cssWidth,
                    cssHeight,
                    allOptions = H.merge(chart.options);
                // Copy the options and add extra options
                options = H.merge(chart.userOptions, chartOptions);

                // create a sandbox where a new chart will be generated
                sandbox = H.createElement('div', null, {
                    position: 'absolute',
                    top: '-9999em',
                    width: chart.chartWidth + 'px',
                    height: chart.chartHeight + 'px'
                }, containerContainer);

                // get the source size
                cssWidth = chart.renderTo.style.width;
                cssHeight = chart.renderTo.style.height;
                sourceWidth = allOptions.exporting.sourceWidth ||
                    allOptions.chart.width ||
                    (/px$/.test(cssWidth) && parseInt(cssWidth, 10)) ||
                    600;
                sourceHeight = allOptions.exporting.sourceHeight ||
                    allOptions.chart.height ||
                    (/px$/.test(cssHeight) && parseInt(cssHeight, 10)) ||
                    400;

                // override some options
                H.extend(options.chart, {
                    animation: false,
                    renderTo: sandbox,
                    forExport: true,
                    renderer: 'SVGRenderer',
                    width: sourceWidth,
                    height: sourceHeight
                });
                options.exporting = { enabled: false }// hide buttons in print
                delete options.data; // #3004
                if (typeof (options.tooltip) == "undefined") options.tooltip = {};
                options.tooltip.userOptions = null; //prevent crash
                options.tooltip.enabled = false;

                // prepare for replicating the chart
                options.series = [];
                H.each(chart.series, function (serie) {
                    seriesOptions = H.merge(serie.userOptions, { // #4912
                        animation: false, // turn off animation
                        enableMouseTracking: false,
                        showCheckbox: false,
                        visible: serie.visible
                    });

                    // Used for the navigator series that has its own option set
                    if (!seriesOptions.isInternal) {
                        options.series.push(seriesOptions);
                    }

                    //troubleshooting crash from pies
                    if (options.series.filter(s => s.type == "pie").length) {
                        //console.log(`Powerup: DEBUG - reporting proactively disabling legend for pie chart.`);
                        //options.legend.enabled = false;
                        if (options.legend.itemStyle) {
                            delete options.legend.itemStyle.lineHeight;
                        }
                    }

                });

                // Assign an internal key to ensure a one-to-one mapping (#5924)
                H.each(chart.axes, function (axis) {
                    if (!axis.userOptions.internalKey) { // #6444
                        axis.userOptions.internalKey = H.uniqueKey();
                    }
                });

                // Add support for narrative
                narrativeSupport(options);

                // generate the chart copy
                try {
                    chartCopy = new H.Chart(options, chart.callback);
                } catch (err) {
                    console.log(`Powerup: reporting - failed to copy chart`)
                    console.warn(err);
                    console.log(options);
                    return null;
                }


                // Axis options and series options  (#2022, #3900, #5982)
                if (chartOptions) {
                    H.each(['xAxis', 'yAxis', 'series'], function (coll) {
                        var collOptions = {};
                        if (chartOptions[coll]) {
                            collOptions[coll] = chartOptions[coll];
                            chartCopy.update(collOptions);
                        }
                    });
                }

                // Reflect axis extremes in the export (#5924)
                H.each(chart.axes, function (axis) {
                    var axisCopy = H.find(chartCopy.axes, function (copy) {
                        return copy.options.internalKey ===
                            axis.userOptions.internalKey;
                    }),
                        extremes = axis.getExtremes(),
                        userMin = extremes.userMin,
                        userMax = extremes.userMax;

                    if (
                        axisCopy &&
                        (
                            (userMin !== undefined && userMin !== axisCopy.min) ||
                            (userMax !== undefined && userMax !== axisCopy.max)
                        )
                    ) {
                        axisCopy.setExtremes(userMin, userMax, true, false);
                    }
                });

                return chartCopy;
            },
                rebuildAndAddToplist = function (charts) {
                    $(DashboardPowerups.SELECTORS.TOPLIST_SELECTOR).each((i, el) => {
                        let data = [], categories = [];
                        let $toplist = $(el);
                        let $tile = $toplist.parents(DashboardPowerups.SELECTORS.TILE_SELECTOR);
                        let $left = $toplist.children().first();
                        let $right = $toplist.children().eq(1);
                        $right.find(DashboardPowerups.SELECTORS.TOPLIST_BAR_SELECTOR).each((b_idx, bar) => {
                            let $bar = $(bar);
                            let color = $bar.css('background-color');
                            let percent = $bar.attr('style').match(/width:([0-9.]+)%/);
                            percent = (Array.isArray(percent) && percent.length > 1) ? Number(percent[1]) : 0;
                            let name = $bar.next().text();
                            let val = $left.children().eq(b_idx).text();

                            data.push({
                                longName: name,
                                color: color,
                                y: percent
                            });
                            categories.push(val);
                        });
                        let $container = $("<div>").appendTo($copies);
                        let options = {
                            chart: {
                                plotBackgroundColor: "#f2f2f2"
                            },
                            credits: {
                                enabled: false
                            },
                            legend: {
                                enabled: false
                            },
                            series: [{
                                type: "bar",
                                data: data,
                                dataLabels: {
                                    enabled: true,
                                    formatter: function () { return this.point.longName },
                                    align: "left",
                                    inside: true,
                                    style: {
                                        fontSize: "10px",
                                        //color: "black",
                                        fontWeight: "",
                                        textOutline: ""
                                    }
                                },
                            }],
                            title: getTitleOpt(null, $tile[0]),
                            xAxis: {
                                categories: categories
                            },
                            yAxis: {
                                title: {
                                    enabled: false
                                }
                            }
                        };
                        narrativeSupport(options);

                        let newChart = H.chart($container[0], options);
                        charts.push(newChart);
                    });
                },
                copyCharts = function () {
                    //get all the charts and export as PDF
                    let charts = [];
                    //Copy all charts for safe keeping
                    H.charts.filter(x => typeof (x) != "undefined").forEach(chart => {
                        /*let opts = H.merge(chart.userOptions);
                        if (typeof (opts.series) == "undefined") opts.series = [];
                        chart.series.forEach(s => opts.series.push(H.merge(s.userOptions)));
                        let container = $(`<div>`).appendTo($copies)[0];*/
                        let opts = {};
                        opts.title = getTitleOpt(chart);
                        //let newChart = H.chart(container, opts);
                        let newChart = copyChart(chart, opts, $copies[0]);
                        charts.push(newChart);
                    });
                    return charts;
                },
                getTitleOpt = function (chart = null, tile = null) {  //Dynatrace charts don't set the title, get it and set it
                    let $chart, $tile;
                    if (chart != null) {
                        $chart = $(chart.container);
                        $tile = $chart.parents(DashboardPowerups.SELECTORS.TILE_SELECTOR);
                    } else if (tile != null) {
                        $tile = $(tile);
                    } else return null;

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
                        return {
                            text: title,
                            align: "left",
                            style: {
                                color: "#454646",
                                fontSize: "12px"
                            }
                        }
                    else return null;
                },
                getSVG = function (charts, options, callback) {
                    const space = 10;
                    let svgArr = [],
                        top = 0,
                        width = 0,
                        fastForward = false,
                        addSVG = function (svgres, i) {
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
                            top += svgHeight + (i + 1 === charts.length ? 0 : space);
                            width = Math.max(width, svgWidth);
                            svgArr.push(svg);
                        },
                        previewSVG = function (svg, i, chartOptions, result = null) {
                            let p = $.Deferred();  //expecting {refresh: bool, id: string}
                            pub.activeChart = charts[i];

                            if (!fastForward) {
                                $previewTitle.html(`<h4>Chart ${i}:</h4>`);
                                $previewContent.html(svg);
                                let id = (result != null && result.id) ? result.id : null;
                                buildOptions(chartOptions, p, id);

                                //next button
                                $(`#generateReportNextButton`).remove();
                                let $next = $(`<button type="button" id="generateReportNextButton">`)
                                    .on('click', gotoNext)
                                    .text("Next")
                                    .addClass("powerupButton")
                                    .addClass("powerupButtonDefault")
                                    .appendTo($buttonBar);

                                //fast forward button
                                $(`#generateReportFFButton`).remove();
                                let $ff = $(`<button type="button" id="generateReportFFButton">`)
                                    .on('click', (e) => {
                                        fastForward = true;
                                        gotoNext(e);
                                    })
                                    .text(" >> ")
                                    .addClass("powerupButton")
                                    .appendTo($buttonBar);
                            } else {
                                p.resolve({
                                    refresh: false,
                                    include: true
                                });
                            }
                            return (p);

                            function gotoNext(e) {
                                let checked = $(`#includeChart`).is(":checked");
                                $previewTitle.text(``);
                                $previewContent.html(``);
                                $previewOptions.html(``);
                                $(`#generateReportRefreshButton, #generateReportNextButton, #generateReportFFButton`).remove();
                                p.resolve({
                                    refresh: false,
                                    include: checked
                                });
                            }
                        },
                        getTitle = function (i, chartOptions = {}) {
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
                            return title; //in case we need the actual title string, use chartOptions by ref
                        },
                        exportChart = function (i, chartOptions = null, result = null) {
                            if (i === charts.length) { //when done, combine everything
                                let combinedSVG = '<svg height="' + top + '" width="' + width +
                                    '" version="1.1" xmlns="http://www.w3.org/2000/svg">' + svgArr.join('') + '</svg>';
                                $previewTitle.text(`Combined:`);
                                $previewContent.html(combinedSVG);
                                return callback(combinedSVG);
                            }

                            if (charts[i] == null
                                || typeof (charts[i].userOptions) == "undefined") { //null chart, skip it
                                return exportChart(i + 1);
                            }

                            if (chartOptions == null)
                                chartOptions = charts[i].userOptions;

                            charts[i].getSVGForLocalExport(options, chartOptions, function () {
                                console.log("Powerup: getSVGForLocalExport Failed to get SVG");
                            }, async function (svg) {
                                let p_result = await previewSVG(svg, i, chartOptions, result);
                                pub.activeChart = null; //don't leak chart
                                if (p_result && p_result.refresh) {
                                    return exportChart(i, chartOptions, p_result);
                                } else {
                                    if (p_result && p_result.include)
                                        addSVG(svg, i);
                                    return exportChart(i + 1); // Export next only when this SVG is received
                                }
                            });
                        };

                    exportChart(0);
                };

            let exportCharts = function (charts, options) {
                options = H.merge(H.getOptions().exporting, options);

                // Get SVG asynchronously and then download the resulting SVG
                getSVG(charts, options, function (combinedsvg) {
                    H.downloadSVGLocal(combinedsvg, options, function () {
                        console.log("Failed to export on client side");
                    });
                    //moved to callback simplify async
                    cleanup(charts);
                });

            },
                cleanup = function (charts) {
                    charts.forEach(chart => {
                        if (chart && typeof (chart.destroy) == "function") {
                            if (typeof (chart.renderer) != "object") chart.renderer = {}; //crash prevention
                            chart.destroy();
                        }
                    });
                    $(`#cancelReportButton`).text('Close');
                };

            // Set global default options for all charts
            H.setOptions({
                exporting: {
                    fallbackToExportServer: false // Ensure the export happens on the client side or not at all
                }
            });


            let charts = copyCharts();
            rebuildAndAddToplist(charts);
            $(`#cancelReportButton`).on('click', () => { cleanup(charts) }); //don't leak charts, if cancelling early
            exportCharts(charts,
                {
                    type: 'application/pdf',
                    libURL: DashboardPowerups.POWERUP_EXT_URL + '3rdParty/Highcharts/lib'
                })

        }(Highcharts));
    }

    function buildOptions(chartOptions, promise, open = null) {
        let $optionsBlock = $(`#PowerupReportGeneratorPreviewOptions`)
            .html('<h4>Options:</h4>')
            .addClass('generated');

        drawIncludeOptions();
        //draw options sections closed, fill in after click
        let $story = $(createSection("PowerupReportOptionsStory", "Data Story (presets)", storyContent));
        let $foreground = $(createSection("PowerupReportOptionsForeground", "Foreground/Background", foregroundContent));
        let $segments = $(createSection("PowerupReportOptionsSegments", "Highlight Segments", highlightContent));
        let $trends = $(createSection("PowerupReportOptionsTrends", "Trendlines"));
        let $bands = $(createSection("PowerupReportOptionsBands", "Plot Bands / Lines", bandsAndLinesContent));
        let $annotations = $(createSection("PowerupReportOptionsAnnotations", "Annotations"));
        let $narrative = $(createSection("PowerupReportOptionsNarrative", "Narrative", narrativeContent));
        let $declutter = $(createSection("PowerupReportOptionsDeclutter", "Declutter", declutterContent));
        let $json = $(createSection("PowerupReportOptionsJSON", "JSON (expert mode)", jsonContent));

        ///////////////////////////////
        function drawIncludeOptions() {
            let $include = $(`
                <span>Include chart:</span>
                <input type="checkbox" id="includeChart" checked>`)
                .appendTo($optionsBlock);
        }

        function createSection(id, name, callback = dummyContent) {
            let $section = $(`<section>`)
                .attr('id', id)
                .appendTo($optionsBlock);
            let $button = $(`
        <button role="button" class="powerupExpandable">
            <div role="img" name="dropdownopen" class="powerupExpandableArrow">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fit="" height="100%" width="100%" preserveAspectRatio="xMidYMid meet" focusable="false"><path d="M403.078 142.412L256 289.49 108.922 142.412l-45.255 45.255L256 380l192.333-192.333z"></path></svg>
            </div>
            <div class="powerupExpandableHeader"> ${name} </div>
        </button>`)
                .appendTo($section);
            let $content = $(`<div>`)
                .addClass("powerupOptionsContent")
                .appendTo($section);

            $button.on('click', function () {
                if ($section.hasClass("powerupOptionsOpen")) {
                    closeThisSection();
                } else {
                    openThisSection();
                    closeOtherSections();
                }
            });

            if (open === id) openThisSection();
            return $section;

            function openThisSection() {
                $section.addClass("powerupOptionsOpen");
                callback($content);
            }

            function closeThisSection() {
                $section.removeClass("powerupOptionsOpen");
                $content.html('');
            }

            function closeOtherSections() {
                $optionsBlock.find(`section:not([id=${id}])`).each((s_i, s) => {
                    $(s).removeClass("powerupOptionsOpen")
                        .find(`.powerupOptionsContent`)
                        .html('');
                })
            }
        }

        function dummyContent(content) {
            let $content = $(content);

            $content.html(`<h3>Dummy content...</h3>`);
        }

        function jsonContent(content) {
            let $content = $(content);
            let $div = $(`<div>`).appendTo($content);
            let $options = $(`<textarea>`)
                .addClass("powerupPreviewOptions")
                .val(JSON.stringify(chartOptions, null, 2))
                .appendTo($div)
                .on('keydown paste', debounce(validateJSON, 100));

            addRefreshButton(
                $div,
                () => {
                    let obj = JSON.parse($options.val());
                    Highcharts.merge(true, chartOptions, obj); //deep copy into chartOptions ref
                });

            let $help = $(`<div>Format help: <a href="https://api.highcharts.com/highcharts/" target="_blank">Highcharts</a></div>`)
                .addClass("powerupHelpFooter")
                .appendTo($content);
        }

        function storyContent(content) {
            let $content = $(content);

            buildRadioOption("none", "None", "");
            buildRadioOption("improvingTrend", "Improving Trend", "Assets/story-mock1.png");
            buildRadioOption("degradingTrend", "Degrading Trend", "Assets/story-mock7.png");
            buildRadioOption("positiveImpact", "Positive Impact", "Assets/story-mock2.png");
            buildRadioOption("negativeImpact", "Negative Impact", "Assets/story-mock3.png");
            buildRadioOption("interestingOutlier", "Interesting Outlier", "Assets/story-mock6.png");
            buildRadioOption("recommendation", "Recommendation", "Assets/story-mock4.png");

            function buildRadioOption(value, text, img, callback = notYetImplemented) {
                let $div, $radio, $right, $img, $span;
                $div = $(`<div>`)
                    .addClass('powerupRadioOption')
                    .appendTo($content);
                $radio = $(`<input type="radio" value="${value}" name="preset">`)
                    .appendTo($div)
                    .on('click', callback);
                $right = $(`<div>`)
                    .appendTo($div);
                $span = $(`<span>`)
                    .text(text)
                    .appendTo($right);
                $img = $(`<img>`)
                    .appendTo($right);
                if (img && img.length)
                    $img.attr('src', DashboardPowerups.POWERUP_EXT_URL + img);
            }

            addRefreshButton();
        }

        function foregroundContent(content) {
            let $content = $(content)
                .addClass('powerupNoFlex');
            let $table = $(`<table>`)
                .appendTo($content);
            let $header = $(`<tr><th>Series</th></tr>`)
                .appendTo($table);
            let $fgheader = $(`<th><a>Foreground</a></th>`)
                .addClass('powerupClickableHeader')
                .appendTo($header)
                .on('click', (e) => {
                    $table.find(`input[type=radio][value="fg"]`)
                        .trigger('click');
                });
            let $bgheader = $(`<th><a>Background</a></th>`)
                .addClass('powerupClickableHeader')
                .appendTo($header)
                .on('click', (e) => {
                    $table.find(`input[type=radio][value="bg"]`)
                        .trigger('click');
                });

            chartOptions.series.forEach((s, s_idx) => {
                let name = seriesName(s);
                let color = s.color;
                let bgcolor = desaturate(color);
                let fgcolor = saturate(color);

                let $row = $(`<tr>`);
                let $series = $(`<td>`)
                    .text(name)
                    .appendTo($row);
                let $fg = $(`<td>`)
                    .appendTo($row);
                let $bg = $(`<td>`)
                    .appendTo($row);
                let $fg_button = $(`<input type="radio" name="${s_idx}" value="fg">`)
                    .appendTo($fg)
                    .on('click', (e) => {
                        chartOptions.series[s_idx].color = fgcolor;
                    });
                let $bg_button = $(`<input type="radio" name="${s_idx}" value="bg">`)
                    .appendTo($bg)
                    .on('click', (e) => {
                        chartOptions.series[s_idx].color = bgcolor;
                    });
                let $fg_color = $(`<div>`)
                    .addClass('powerupColorPreview')
                    .html(`&nbsp;`)
                    .css('background-color', fgcolor)
                    .appendTo($fg)
                    .on('click', () => { $fg_button.trigger('click') });
                let $bg_color = $(`<div>`)
                    .addClass('powerupColorPreview')
                    .html(`&nbsp;`)
                    .css('background-color', bgcolor)
                    .appendTo($bg)
                    .on('click', () => { $bg_button.trigger('click') });
                $row.appendTo($table);
            });
            addRefreshButton($content);
        }

        function declutterContent(content) {
            if (typeof (chartOptions) != "object" || !Object.keys(chartOptions).length) return false; //crash prevention
            let $content = $(content)
                .addClass('powerupNoFlex');
            let $table = $(`<table>`)
                .appendTo($content);
            let $header = $(`<tr><th>Visual</th></tr>`)
                .appendTo($table);
            let $enabledheader = $(`<th><a>Enabled</a></th>`)
                .addClass('powerupClickableHeader')
                .on('click', () => { $content.find(`input[type=radio][value="enable"]`).trigger('click') })
                .appendTo($header);
            let $disabledheader = $(`<th><a>Disabled</a></th>`)
                .addClass('powerupClickableHeader')
                .on('click', () => { $content.find(`input[type=radio][value="disable"]`).trigger('click') })
                .appendTo($header);

            //chart title
            if (typeof (chartOptions.title) != "object") chartOptions.title = {};
            buildTextRow("Chart Title", chartOptions.title.text, function (e) {
                let val = $(this).val();
                if (val && val.length) {
                    chartOptions.title.text = val;
                } else {
                    chartOptions.title.text = undefined;
                }

            });

            //xAxis title
            if (typeof (chartOptions.xAxis) != "object") chartOptions.xAxis = {};
            if (typeof (chartOptions.xAxis.title) != "object") chartOptions.xAxis.title = {};
            buildTextRow("xAxis Title", chartOptions.xAxis.title.text, function (e) {
                let val = $(this).val();
                if (val && val.length) {
                    chartOptions.xAxis.title.text = val;
                    chartOptions.xAxis.title.enabled = true
                } else {
                    chartOptions.xAxis.title.text = undefined;
                    chartOptions.xAxis.title.enabled = false
                }
            });

            //xAxis labels
            if (typeof (chartOptions.xAxis) != "object") chartOptions.xAxis = {};
            if (typeof (chartOptions.xAxis.labels) != "object") chartOptions.xAxis.labels = {};
            buildRadioRow(
                "xAxis Labels",
                chartOptions.xAxis.labels.enabled,
                () => { chartOptions.xAxis.labels.enabled = true },
                () => { chartOptions.xAxis.labels.enabled = false },
            );

            //xAxis gridlines
            if (typeof (chartOptions.xAxis) != "object") chartOptions.xAxis = {};
            buildRadioRow(
                "xAxis Gridlines",
                chartOptions.xAxis.gridLineWidth > 0,
                () => {
                    chartOptions.xAxis.gridLineWidth = 1;
                    chartOptions.xAxis.gridLineColor = "#b7b7b7";
                },
                () => { chartOptions.xAxis.gridLineWidth = 0 },
            );

            //legend
            if (typeof (chartOptions.legend) != "object") chartOptions.legend = {};
            if (typeof (chartOptions.legend.itemStyle) != "object") chartOptions.legend.itemStyle = {};
            buildRadioRow(
                "Legend",
                chartOptions.legend.enabled,
                () => {
                    chartOptions.legend.enabled = true;
                    chartOptions.legend.itemStyle.fontSize = "10px";
                },
                () => { chartOptions.legend.enabled = false },
            );

            //yAxes titles & labels
            if (Array.isArray(chartOptions.yAxis)) {
                chartOptions.yAxis.forEach((yAxis, axisNum) => {
                    if (!pub.activeChart.yAxis[axisNum].visible) return;
                    if (typeof (yAxis.title) != "object") yAxis.title = {};
                    buildTextRow(`yAxis(${axisNum}) Title`, chartOptions.xAxis.title.text, function (e) {
                        let val = $(this).val();
                        if (val && val.length) {
                            yAxis.title.text = val;
                            yAxis.title.enabled = true
                        } else {
                            yAxis.title.text = undefined;
                            yAxis.title.enabled = false
                        }
                    });
                    if (typeof (yAxis.labels) != "object") yAxis.labels = {};
                    buildRadioRow(
                        `yAxis(${axisNum}) Labels`,
                        yAxis.labels.enabled,
                        () => { yAxis.labels.enabled = true },
                        () => { yAxis.labels.enabled = false },
                    );
                    buildRadioRow(
                        `yAxis(${axisNum}) Gridlines`,
                        yAxis.gridLineWidth > 0,
                        () => {
                            yAxis.gridLineWidth = 1;
                            yAxis.gridLineColor = "#b7b7b7";
                        },
                        () => { yAxis.gridLineWidth = 0 },
                    );
                })
            }

            //series data labels & markers
            if (Array.isArray(chartOptions.series)) {
                chartOptions.series.forEach((serie, s_idx) => {
                    let name = seriesName(serie);
                    if (typeof (serie.dataLabels) != "object") serie.dataLabels = {};
                    buildRadioRow(
                        `Series (${s_idx} - ${name}) Data Labels`,
                        serie.dataLabels.enabled,
                        () => { serie.dataLabels.enabled = true },
                        () => { serie.dataLabels.enabled = false },
                    );
                    if (typeof (serie.marker) != "object") serie.marker = {};
                    buildRadioRow(
                        `Series (${s_idx} - ${name}) Data Markers`,
                        serie.marker.enabled,
                        () => { serie.marker.enabled = true },
                        () => { serie.marker.enabled = false },
                    );
                })
            }

            addRefreshButton($content);

            function buildRadioRow(name, enabled, enableCallback, disableCallback) {
                let $row = $(`<tr>`);
                let $name = $(`<td>`)
                    .text(name)
                    .appendTo($row);
                let $enable = $(`<td>`)
                    .appendTo($row);
                let $disable = $(`<td>`)
                    .appendTo($row);
                let $enable_button = $(`<input type="radio" value="enable">`)
                    .attr('name', name)
                    .attr('checked', enabled)
                    .appendTo($enable)
                    .on('click', enableCallback);
                let $disable_button = $(`<input type="radio" value="disable">`)
                    .attr('name', name)
                    .attr('checked', !enabled)
                    .appendTo($disable)
                    .on('click', disableCallback);

                $row.appendTo($table);
            }

            function buildTextRow(name, value, editCallback) {
                let $row = $(`<tr>`);
                let $name = $(`<td>`)
                    .text(name)
                    .appendTo($row);
                let $text = $(`<td colspan=2>`)
                    .appendTo($row);
                let $input = $(`<input type="text">`)
                    .attr('name', name)
                    .val(value)
                    .appendTo($text)
                    .on('change', editCallback);

                $row.appendTo($table);
            }
        }

        function narrativeContent(content) {
            let $content = $(content);

            let $textarea = $(`<textarea>`)
                .addClass('powerupPreviewOptions')
                .appendTo($content);

            if (chartOptions.customNarrative && chartOptions.customNarrative.text)
                $textarea.val(chartOptions.customNarrative.text);

            $textarea.on('keydown paste', debounce(
                () => { chartOptions.customNarrative.text = $textarea.val() },
                100));

            addRefreshButton($content);
        }

        function bandsAndLinesContent(content) {
            let $content = $(content);
            let $buttons = $(`<div>`)
                .appendTo($content)
                .addClass('powerupNoFlex');
            let $linesAndBands = $(`<div>`)
                .appendTo($content)
                .addClass('powerupNoFlex');
            let $addLine = $(`<button>`)
                .addClass('powerupButton')
                .text(`+ Line`)
                .on(`click`, () => { addLine() })
                .appendTo($buttons);
            let $addBand = $(`<button>`)
                .addClass('powerupButton')
                .text(`+ Band`)
                .on(`click`, () => { addBand() })
                .appendTo($buttons);


            drawExistingPlotLines();
            drawExistingPlotBands();
            addRefreshButton($content);


            ///////////////
            function drawExistingPlotLines() {
                if (Array.isArray(chartOptions.xAxis)) {
                    chartOptions.xAxis.forEach((x, xIdx) => {
                        if (Array.isArray(x.plotLines) && x.plotLines.length)
                            x.plotLines.forEach(pl => { addLine(pl) })
                    });
                } else if (typeof (chartOptions.xAxis) == "object") {
                    if (Array.isArray(chartOptions.xAxis.plotLines) && chartOptions.xAxis.plotLines.length)
                        chartOptions.xAxis.plotLines.forEach(pl => { addLine(pl) })
                }
                if (Array.isArray(chartOptions.yAxis)) {
                    chartOptions.yAxis.forEach((y, yIdx) => {
                        if (Array.isArray(y.plotLines) && y.plotLines.length)
                            y.plotLines.forEach(pl => { addLine(pl) })
                    });
                }
            }

            function drawExistingPlotBands() {
                if (Array.isArray(chartOptions.xAxis)) {
                    chartOptions.xAxis.forEach((x, xIdx) => {
                        if (Array.isArray(x.plotBands) && x.plotBands.length)
                            x.plotBands.forEach(pl => { addBand(pl) })
                    });
                } else if (typeof (chartOptions.xAxis) == "object") {
                    if (Array.isArray(chartOptions.xAxis.plotBands) && chartOptions.xAxis.plotBands.length)
                        chartOptions.xAxis.plotBands.forEach(pl => { addBand(pl) })
                }
                if (Array.isArray(chartOptions.yAxis)) {
                    chartOptions.yAxis.forEach((y, yIdx) => {
                        if (Array.isArray(y.plotBands) && y.plotBands.length)
                            y.plotBands.forEach(pl => { addBand(pl) })
                    });
                }
            }

            function removeLineFromOptions(line) {
                if (chartOptions.xAxis && Array.isArray(chartOptions.xAxis)) {
                    chartOptions.xAxis.forEach(axis => {
                        if (Array.isArray(axis.plotLines)) {
                            axis.plotLines = axis.plotLines.filter(x => x != line);
                        }
                    })
                } else if (chartOptions.xAxis && typeof (chartOptions.xAxis) == "object") {
                    let axis = chartOptions.xAxis;
                    if (Array.isArray(axis.plotLines)) {
                        axis.plotLines = axis.plotLines.filter(x => x != line);
                    }
                }
                if (chartOptions.yAxis && Array.isArray(chartOptions.yAxis)) {
                    chartOptions.yAxis.forEach(axis => {
                        if (Array.isArray(axis.plotLines)) {
                            axis.plotLines = axis.plotLines.filter(x => x != line);
                        }
                    })
                }
            }

            function addLineToOptions(line) {
                let axis;
                if (Array.isArray(chartOptions[line.axis])) { //case: multiple axes
                    axis = chartOptions[line.axis][line.axisNum];
                } else if (typeof (chartOptions[line.axis]) == "object") { //case: single axis
                    axis = chartOptions[line.axis];
                } else { //case: not in options
                    chartOptions[line.axis] = [];
                    axis = {};
                    chartOptions[line.axis].push(axis);
                }
                if (!Array.isArray(axis.plotLines)) axis.plotLines = [];
                axis.plotLines.push(line);
            }

            function addLine(line = null) {
                if (line == null) {
                    line = {
                        color: "#526cff",
                        axis: "xAxis",
                        axisNum: 0,
                        value: null,
                        label: {
                            text: "New Line"
                        },
                        width: 2,
                        zIndex: 2
                    }
                }
                let axis, min, max;

                let $lineDiv = $(`<div>`)
                    .addClass('powerupLineConfig')
                    .appendTo($linesAndBands);
                let $table = $(`<table>`).appendTo($lineDiv);
                let $header = $(`<tr><th></th><th>Plot line</th></tr>`).appendTo($table);

                //Component: Axis selector
                let $axisRow = $(`<tr><td>Axis:</td><td></td></tr>`).appendTo($table);
                let $axisSelector = $(`<select>`).appendTo($axisRow.children().eq(1));
                pub.activeChart.xAxis.forEach((x, xIdx) => {
                    if (!x.visible) return;
                    let $opt = $(`<option>`)
                        .data('axis', 'xAxis')
                        .data('axisNum', xIdx)
                        .text(`xAxis - ${xIdx}`)
                        .appendTo($axisSelector);
                });
                pub.activeChart.yAxis.forEach((y, yIdx) => {
                    if (!y.visible) return;
                    let $opt = $(`<option>`)
                        .data('axis', 'yAxis')
                        .data('axisNum', yIdx)
                        .text(`yAxis - ${yIdx}`)
                        .appendTo($axisSelector);
                });

                let $valueRow = $(`<tr><td>Value:</td><td></td></tr>`).appendTo($table);
                let $range = $(`<input type="range">`)
                    .appendTo($valueRow.children().eq(1));
                let $value = $(`<input type="text">`)
                    .val(line.value)
                    .appendTo($valueRow.children().eq(1));
                $range.on('change', () => {
                    $value.val($range.val());
                    $value.trigger('change');
                });

                let $colorRow = $(`<tr><td>Color:</td><td></td></tr>`).appendTo($table);
                let $colorPicker = $(`<input type="color">`)
                    .val(line.color)
                    .appendTo($colorRow.children().eq(1));

                let $labelRow = $(`<tr><td>Label:</td><td></td></tr>`).appendTo($table);
                let $label = $(`<input type="text">`)
                    .val(line.label.text)
                    .appendTo($labelRow.children().eq(1));

                //vals
                $axisSelector.on('change', () => {
                    line.axis = $axisSelector.children(`:selected`).data('axis');
                    line.axisNum = $axisSelector.children(`:selected`).data('axisNum');

                    axis = pub.activeChart[line.axis][line.axisNum];
                    min = axis.min;
                    max = axis.max;
                    if (line.value == null
                        || line.value < min
                        || line.value > max)
                        line.value = (min + max) / 2;

                    $range
                        .attr('min', min)
                        .attr('max', max)
                        .val(line.value)
                        .trigger('change');

                    removeLineFromOptions(line);
                    addLineToOptions(line);

                    if (axis && axis.isDatetimeAxis) {
                        let $td = $valueRow.children().eq(1)
                            .addClass('powerupTDTooltip');
                        let $hover = $(`<div>`)
                            .addClass('powerupTDTooltipText')
                            .text(Date($value.val()).toString())
                            .appendTo($td);
                        $value.on('change', () => {
                            $hover
                                .text(Date($value.val()).toString());
                        })
                    } else {
                        $valueRow.children().removeClass('powerupTDTooltip');
                        $valueRow.find(`.powerupTDTooltipText`).remove();
                    }
                });
                $axisSelector
                    .val(`${line.axis} - ${line.axisNum}`)
                    .trigger('change');

                //update on change
                $value.on('change', () => { line.value = $value.val() });
                $colorPicker.on('change', () => { line.color = $colorPicker.val() });
                $label.on('change', () => { line.label.text = $label.val() });

                //delete button
                let $remove = $(`<button>`)
                    .addClass('powerupButton')
                    .addClass('powerupCloseButton')
                    .text('x')
                    .appendTo($lineDiv)
                    .on('click', () => {
                        removeLineFromOptions(line);
                        $lineDiv.remove();
                    })

                return line;
            }

            function removeBandFromOptions(band) {
                if (chartOptions.xAxis && Array.isArray(chartOptions.xAxis)) {
                    chartOptions.xAxis.forEach(axis => {
                        if (Array.isArray(axis.plotBands)) {
                            axis.plotBands = axis.plotBands.filter(x => x != band);
                        }
                    })
                } else if (chartOptions.xAxis && typeof (chartOptions.xAxis) == "object") {
                    let axis = chartOptions.xAxis;
                    if (Array.isArray(axis.plotBands)) {
                        axis.plotBands = axis.plotBands.filter(x => x != band);
                    }
                }
                if (chartOptions.yAxis && Array.isArray(chartOptions.yAxis)) {
                    chartOptions.yAxis.forEach(axis => {
                        if (Array.isArray(axis.plotBands)) {
                            axis.plotBands = axis.plotBands.filter(x => x != band);
                        }
                    })
                }
            }

            function addBandToOptions(band) {
                let axis;
                if (Array.isArray(chartOptions[band.axis])) { //case: multiple axes
                    axis = chartOptions[band.axis][band.axisNum];
                } else if (typeof (chartOptions[band.axis]) == "object") { //case: single axis
                    axis = chartOptions[band.axis];
                } else { //case: not in options
                    chartOptions[band.axis] = [];
                    axis = {};
                    chartOptions[band.axis].push(axis);
                }
                if (!Array.isArray(axis.plotBands)) axis.plotBands = [];
                axis.plotBands.push(band);
            }

            function addBand(band = null) {
                if (band == null) {
                    band = {
                        color: "#fff5e4",
                        axis: "xAxis",
                        axisNum: 0,
                        from: null,
                        to: null,
                        label: {
                            text: "New Band"
                        },
                        zIndex: 0
                    }
                }
                let axis, min, max;

                let $bandDiv = $(`<div>`)
                    .addClass('powerupBandConfig')
                    .appendTo($linesAndBands);
                let $table = $(`<table>`).appendTo($bandDiv);
                let $header = $(`<tr><th></th><th>Plot band</th></tr>`).appendTo($table);

                //Component: Axis selector
                let $axisRow = $(`<tr><td>Axis:</td><td></td></tr>`).appendTo($table);
                let $axisSelector = $(`<select>`).appendTo($axisRow.children().eq(1));
                pub.activeChart.xAxis.forEach((x, xIdx) => {
                    if (!x.visible) return;
                    let $opt = $(`<option>`)
                        .data('axis', 'xAxis')
                        .data('axisNum', xIdx)
                        .text(`xAxis - ${xIdx}`)
                        .appendTo($axisSelector);
                });
                pub.activeChart.yAxis.forEach((y, yIdx) => {
                    if (!y.visible) return;
                    let $opt = $(`<option>`)
                        .data('axis', 'yAxis')
                        .data('axisNum', yIdx)
                        .text(`yAxis - ${yIdx}`)
                        .appendTo($axisSelector);
                });

                let $fromRow = $(`<tr><td>From:</td><td></td></tr>`).appendTo($table);
                let $fromRange = $(`<input type="range">`)
                    .appendTo($fromRow.children().eq(1));
                let $from = $(`<input type="text">`)
                    .val(band.from)
                    .appendTo($fromRow.children().eq(1));
                $fromRange.on('change', () => {
                    $from.val($fromRange.val());
                    $from.trigger('change');
                });

                let $toRow = $(`<tr><td>To:</td><td></td></tr>`).appendTo($table);
                let $toRange = $(`<input type="range">`)
                    .appendTo($toRow.children().eq(1));
                let $to = $(`<input type="text">`)
                    .val(band.to)
                    .appendTo($toRow.children().eq(1));
                $toRange.on('change', () => {
                    $to.val($toRange.val());
                    $to.trigger('change');
                });

                let $colorRow = $(`<tr><td>Color:</td><td></td></tr>`).appendTo($table);
                let $colorPicker = $(`<input type="color">`)
                    .val(band.color)
                    .appendTo($colorRow.children().eq(1));

                let $labelRow = $(`<tr><td>Label:</td><td></td></tr>`).appendTo($table);
                let $label = $(`<input type="text">`)
                    .val(band.label.text)
                    .appendTo($labelRow.children().eq(1));

                //vals
                $axisSelector.on('change', () => {
                    band.axis = $axisSelector.children(`:selected`).data('axis');
                    band.axisNum = $axisSelector.children(`:selected`).data('axisNum');

                    axis = pub.activeChart[band.axis][band.axisNum];
                    min = axis.min;
                    max = axis.max;
                    if (band.from == null
                        || band.from < min
                        || band.from > max)
                        band.from = min + ((max - min) / 4);
                    if (band.to == null
                        || band.to < min
                        || band.to > max)
                        band.to = max - ((max - min) / 4);

                    $fromRange
                        .attr('min', min)
                        .attr('max', max)
                        .val(band.from)
                        .trigger('change');
                    $toRange
                        .attr('min', min)
                        .attr('max', max)
                        .val(band.to)
                        .trigger('change');

                    removeBandFromOptions(band);
                    addBandToOptions(band);

                    if (axis && axis.isDatetimeAxis) {
                        let $td = $fromRow.children().eq(1)
                            .addClass('powerupTDTooltip');
                        let $hover = $(`<div>`)
                            .addClass('powerupTDTooltipText')
                            .text(Date($from.val()).toString())
                            .appendTo($td);
                        $from.on('change', () => {
                            $hover
                                .text(Date($from.val()).toString());
                        })

                        $td = $toRow.children().eq(1)
                            .addClass('powerupTDTooltip');
                        $hover = $(`<div>`)
                            .addClass('powerupTDTooltipText')
                            .text(Date($td.val()).toString())
                            .appendTo($td);
                        $to.on('change', () => {
                            $hover
                                .text(Date($to.val()).toString());
                        })
                    } else {
                        $fromRow.children().removeClass('powerupTDTooltip');
                        $fromRow.find(`.powerupTDTooltipText`).remove();
                        $toRow.children().removeClass('powerupTDTooltip');
                        $toRow.find(`.powerupTDTooltipText`).remove();
                    }
                });
                $axisSelector
                    .val(`${band.axis} - ${band.axisNum}`)
                    .trigger('change');

                //update on change
                $from.on('change', () => { band.from = $from.val() });
                $to.on('change', () => { band.to = $to.val() });
                $colorPicker.on('change', () => { band.color = $colorPicker.val() });
                $label.on('change', () => { band.label.text = $label.val() });

                //delete button
                let $remove = $(`<button>`)
                    .addClass('powerupButton')
                    .addClass('powerupCloseButton')
                    .text('x')
                    .appendTo($bandDiv)
                    .on('click', () => {
                        removeLineFromOptions(band);
                        $bandDiv.remove();
                    })

                return band;
            }
        }

        function highlightContent(content) {
            let $content = $(content);
            let $buttons = $(`<div>`)
                .appendTo($content)
                .addClass('powerupNoFlex');
            let $highlights = $(`<div>`)
                .appendTo($content)
                .addClass('powerupNoFlex');
            let $addHighlight = $(`<button>`)
                .addClass('powerupButton')
                .text(`+ Highlight`)
                .on(`click`, () => { addHighlight() })
                .appendTo($buttons);



            drawExistingHighlights();
            addRefreshButton($content);


            function drawExistingHighlights() {
                if (Array.isArray(chartOptions.series)) {
                    chartOptions.series.forEach((s, sIdx) => {
                        if (Array.isArray(s.highlights)) {
                            s.highlights.forEach(h => addHighlight(h))
                        }
                    })
                }
            }

            function removeHighlightFromOptions(highlight) {
                let series = chartOptions.series[highlight.seriesNum];
                if (Array.isArray(series.highlights)) {
                    series.highlights = series.highlights.filter(x => x != highlight);

                    if (series.originalColor) {
                        series.color = series.originalColor;
                        delete series.originalColor;
                        series.data.forEach((d, dIdx) => { //delete only matching, in case there's other highlights
                            if (typeof (d.x) != "undefined") {
                                if (d.x >= highlight.from && d.x <= highlight.to) {
                                    delete d.color;
                                }
                            }
                        })
                    }
                }
            }

            function addHighlightToOptions(highlight) {
                let series = chartOptions.series[highlight.seriesNum];
                if (!Array.isArray(series.highlights)) series.highlights = [];
                series.highlights.push(highlight);

                let originalColor;
                if (series.originalColor) {
                    originalColor = series.originalColor;
                } else {
                    originalColor = series.color;
                    series.originalColor = originalColor;
                }
                series.color = desaturate(originalColor);
                series.data.forEach((d, dIdx) => {
                    if (Array.isArray(d) && d.length == 2) { //data type 1: array of 2 element arrays
                        if (d[0] >= highlight.from && d[0] <= highlight.to) {
                            let newD = {};
                            newD.x = d[0];
                            newD.y = d[1];
                            newD.color = highlight.color;
                            series.data[dIdx] = newD; //switch to object
                        }
                    } else if (typeof (d) == "object") { //data type 2: object
                        if (d.x >= highlight.from && d.x <= highlight.to) {
                            d.color = highlight.color;
                        }
                    } else if (typeof (d.x) != "undefined") { //data type 3: primitive
                        let newD = {};
                        newD.y = d;
                        newD.color = highlight.color;
                        series.data[dIdx] = newD; //switch to object
                    }
                })
            }

            function addHighlight(highlight = null) {
                if (highlight == null) {
                    highlight = {
                        color: null,
                        seriesNum: 0,
                        from: null,
                        to: null
                    }
                }
                let series, axis, min, max;

                let $highlightDiv = $(`<div>`)
                    .addClass('powerupLineConfig')
                    .appendTo($highlights);
                let $table = $(`<table>`).appendTo($highlightDiv);
                let $header = $(`<tr><th></th><th>Highlight</th></tr>`).appendTo($table);


                //Component: Series selector
                let $seriesRow = $(`<tr><td>Series:</td><td></td></tr>`).appendTo($table);
                let $seriesSelector = $(`<select>`).appendTo($seriesRow.children().eq(1));
                pub.activeChart.series.forEach((s, sIdx) => {
                    if (!s.visible) return;
                    let $opt = $(`<option>`)
                        .data('seriesNum', sIdx)
                        .val(sIdx)
                        .text(seriesName(s))
                        .appendTo($seriesSelector);
                });


                let $fromRow = $(`<tr><td>From:</td><td></td></tr>`).appendTo($table);
                let $fromRange = $(`<input type="range">`)
                    .appendTo($fromRow.children().eq(1));
                let $from = $(`<input type="text">`)
                    .val(highlight.from)
                    .appendTo($fromRow.children().eq(1));
                $fromRange.on('change', () => {
                    $from.val($fromRange.val());
                    $from.trigger('change');
                });

                let $toRow = $(`<tr><td>To:</td><td></td></tr>`).appendTo($table);
                let $toRange = $(`<input type="range">`)
                    .appendTo($toRow.children().eq(1));
                let $to = $(`<input type="text">`)
                    .val(highlight.to)
                    .appendTo($toRow.children().eq(1));
                $toRange.on('change', () => {
                    $to.val($toRange.val());
                    $to.trigger('change');
                });

                let $colorRow = $(`<tr><td>Color:</td><td></td></tr>`).appendTo($table);
                let $colorPicker = $(`<input type="color">`)
                    //.val(highlight.color)
                    .appendTo($colorRow.children().eq(1));


                //vals
                $seriesSelector.on('change', () => {
                    highlight.seriesNum = $seriesSelector.children(`:selected`).data('seriesNum');

                    series = pub.activeChart.series[highlight.seriesNum];
                    axis = series.xAxis;
                    min = axis.min;
                    max = axis.max;
                    if (highlight.from == null
                        || highlight.from < min
                        || highlight.from > max)
                        highlight.from = min + ((max - min) / 4);
                    if (highlight.to == null
                        || highlight.to < min
                        || highlight.to > max)
                        highlight.to = max - ((max - min) / 4);

                    if (highlight.color == null) {
                        highlight.color = saturate(series.color, "hex");
                    }
                    $colorPicker.val(highlight.color);

                    $fromRange
                        .attr('min', min)
                        .attr('max', max)
                        .val(highlight.from)
                        .trigger('change');
                    $toRange
                        .attr('min', min)
                        .attr('max', max)
                        .val(highlight.to)
                        .trigger('change');

                    removeHighlightFromOptions(highlight);
                    addHighlightToOptions(highlight);

                    if (axis && axis.isDatetimeAxis) {
                        let $td = $fromRow.children().eq(1)
                            .addClass('powerupTDTooltip');
                        let $hover = $(`<div>`)
                            .addClass('powerupTDTooltipText')
                            .text(Date($from.val()).toString())
                            .appendTo($td);
                        $from.on('change', () => {
                            $hover
                                .text(Date($from.val()).toString());
                        })

                        $td = $toRow.children().eq(1)
                            .addClass('powerupTDTooltip');
                        $hover = $(`<div>`)
                            .addClass('powerupTDTooltipText')
                            .text(Date($td.val()).toString())
                            .appendTo($td);
                        $to.on('change', () => {
                            $hover
                                .text(Date($to.val()).toString());
                        })
                    } else {
                        $fromRow.children().removeClass('powerupTDTooltip');
                        $fromRow.find(`.powerupTDTooltipText`).remove();
                        $toRow.children().removeClass('powerupTDTooltip');
                        $toRow.find(`.powerupTDTooltipText`).remove();
                    }
                });
                $seriesSelector
                    .val(highlight.seriesNum)
                    .trigger('change');

                //update on change
                $from.on('change', () => { highlight.from = $from.val() });
                $to.on('change', () => { highlight.to = $to.val() });
                $colorPicker.on('change', () => { highlight.color = $colorPicker.val() });

                //delete button
                let $remove = $(`<button>`)
                    .addClass('powerupButton')
                    .addClass('powerupCloseButton')
                    .text('x')
                    .appendTo($highlightDiv)
                    .on('click', () => {
                        removeHighlightFromOptions(highlight);
                        $highlightDiv.remove();
                    })

                return highlight;
            }
        }

        function notYetImplemented() {
            alert(`Not yet implemented...`);
        }

        function addRefreshButton(target = "#PowerupReportGeneratorButtonBar", refreshCallback = () => { }) {
            let $target = $(target);
            let id = $(`section.powerupOptionsOpen`).attr('id');
            let $refresh = $(`<button type="button" id="generateReportRefreshButton">`)
                .on('click', (e) => {
                    try {
                        refreshCallback();
                    } catch (err) {
                        let $err = $target.find(`.powerupErrorBar`);
                        if (!$err.length)
                            $err = $(`<span>`)
                                .addClass("powerupErrorBar")
                                .appendTo($target);
                        $err.text(err);
                        return (false);
                    }

                    $(`#generateReportRefreshButton`).remove();
                    promise.resolve({
                        refresh: true,
                        id: id
                    });
                })
                .text("Refresh")
                .addClass("powerupButton")
                .appendTo($target);

            return $refresh;
        }
    }

    function validateJSON(e) {
        let $target = $(e.target);
        let valid = true;
        try {
            JSON.parse($target.val());
        } catch (err) {
            valid = false;
        }
        if (valid) {
            $target.addClass("powerupValidJSON");
            $target.removeClass("powerupInvalidJSON");
        } else {
            $target.addClass("powerupInvalidJSON");
            $target.removeClass("powerupValidJSON");
        }
    }

    const debounce = (func, wait) => {
        let timeout;

        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };

            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    const componentToHex = (c) => {
        let hex = c.toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    }

    const rgbToHex = (r, g, b) => {
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    const desaturate = (color, format = "rbg") => {
        const factor = 0.25;
        if (typeof (d3) == "undefined") {
            console.log(`Powerup reporting: WARN - D3 unavailable`);
            return color;
        }

        let hsl = d3.hsl(color);
        if (isNaN(hsl.h)) {
            console.log(`Powerup reporting: WARN - D3 invalid color`);
            return color;
        }

        hsl.s = hsl.s * factor;

        switch (format) {
            case "hex":
                let rbg = hsl.rbg();
                return rgbToHex(rbg.r, rbg.b, rbg.g);
            //case "hsl":
            //    return hsl.formatHsl();
            case "d3":
                return hsl;
            case "rbg":
            default:
                return hsl.toString();
        }
    }

    const saturate = (color, format = "rbg") => {
        const factor = 1.75;
        if (typeof (d3) == "undefined") {
            console.log(`Powerup reporting: WARN - D3 unavailable`);
            return color;
        }

        let hsl = d3.hsl(color);
        if (isNaN(hsl.h)) {
            console.log(`Powerup reporting: WARN - D3 invalid color`);
            return color;
        }

        hsl.s = hsl.s * factor;

        switch (format) {
            case "hex":
                let rbg = hsl.rbg();
                return rgbToHex(rbg.r, rbg.b, rbg.g);
            //case "hsl":
            //    return hsl.formatHsl();
            case "d3":
                return hsl;
            case "rbg":
            default:
                return hsl.toString();
        }
    }

    const seriesName = (series) => {
        let name = "";
        if (series && series.name && series.name != "null") {
            name = series.name;
        } else if (series && series.entityId && series.entityId != "null") {
            name = series.entityId;
        } else if (series && series.chartableTimeseriesUniqueIdentifier && series.chartableTimeseriesUniqueIdentifier != "null") {
            name = series.chartableTimeseriesUniqueIdentifier;
        }
        let idx = name.indexOf('¦');
        if (idx < 1) idx = name.indexOf('|'); //sometimes a broken pipe, sometimes a pipe
        if (idx > 0) name = name.substring(0, idx);

        if (name == "" && typeof (series.index) !== "undefined")
            name = `Series: ${series.index}`;


        //TODO: add DT API to get actual entity names
        return name;
    }

    const narrativeSupport = (options) => {
        if (typeof (options.customNarrative) != "object")
            options.customNarrative = {
                text: "",
                width: 200,
                height: 200,
                position: "right"
            };
        if (typeof (options.chart) == "object") {
            if (typeof (options.chart.events) != "object")
                options.chart.events = {};
            if (typeof (options.chart.events.load) != "function")
                options.chart.events.load = function () {
                    let x, y;
                    switch (options.customNarrative.position) {
                        case "bottom":
                            x = 0;
                            break;
                        case "right":
                        default:
                            x = options.chart.width || 200;
                            if (options.customNarrative.text.length) {
                                if (!options.chart.originalWidth) {
                                    options.chart.originalWidth = options.chart.width;
                                    options.chart.width += options.customNarrative.width;
                                } else { //already expanded

                                }
                            } else { //nothing to display
                                if (options.chart.originalWidth) {
                                    options.chart.width = options.chart.originalWidth;
                                } else { //wasn't expanded

                                }
                            }

                            break;
                    }

                    y = options.chart.height - 10;

                    if (this.customNarrative) {
                        this.customNarrative.destroy();
                        this.customNarrative = undefined;
                    }

                    this.customNarrative = this.renderer.g('customNarrative').add();
                    this.renderer.text(options.customNarrative.text, x, y)
                        .css({
                            color: "#6d6d6d",
                            fontSize: "12px",
                            width: "200px"
                        })
                        .add(this.customNarrative);
                }
        }
    }

    return pub;
})();