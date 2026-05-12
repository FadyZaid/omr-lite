// QuestionAnalysis.js - Shared question analysis component with ApexCharts

class QuestionAnalysis {
    constructor() {
        this.currentAnalysisData = null;
        this.currentChart = null;
    }

    async fetchAndDisplay(batchId, answerKey, containerId = "analysisContainer") {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error("Analysis container not found:", containerId);
            return;
        }

        try {
            container.innerHTML =
                '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Analyzing questions...</div>';
            container.style.display = "block";

            const response = await fetch(`/analyze_questions/${batchId}?answer_key=${encodeURIComponent(answerKey)}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "Analysis failed");
            }

            this.currentAnalysisData = data;
            this.render(container, data, batchId);
        } catch (error) {
            console.error("Analysis error:", error);
            container.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${error.message}</div>`;
        }
    }

    render(container, data, batchId) {
        const { total_students, analysis } = data;
        const chartId = `chart-analysis-${batchId}`;

        let html = `
            <div class="chart-container">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4><i class="fas fa-chart-bar"></i> Question Analysis</h4>
                </div>
                <p class="text-muted" style="margin-bottom: 20px;">
                    Total Students: <strong>${total_students}</strong>
                </p>
                
                <div class="row mb-4">
                    <div class="col-12">
                        <div style="background: white; padding: 30px; border-radius: 12px; border: 2px solid var(--neutral-border); box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                            <div id="${chartId}" style="width: 100%; min-height: 500px;"></div>
                        </div>
                    </div>
                </div>
                
                <div class="row">
                    <div class="col-12">
                        <div style="background: white; padding: 25px; border-radius: 12px; border: 1px solid var(--neutral-border);">
                            <h5 style="color: #2d3748; font-weight: 700; margin-bottom: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                                <i class="fas fa-table"></i> Detailed Statistics
                            </h5>
                            <div style="max-height: 400px; overflow-y: auto;">
                                <table class="table table-sm table-hover" style="margin: 0;">
                                    <thead style="position: sticky; top: 0; background: linear-gradient(135deg, #2c5282 0%, #3182ce 100%); color: white; z-index: 10;">
                                        <tr>
                                            <th style="padding: 12px; text-align: center;">Q#</th>
                                            <th style="padding: 12px; text-align: center;">Correct</th>
                                            <th style="padding: 12px; text-align: center;">Wrong</th>
                                            <th style="padding: 12px; text-align: center;">Uncertain</th>
                                            <th style="padding: 12px; text-align: center;">% Correct</th>
                                            <th style="padding: 12px; text-align: center;">Difficulty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this.renderTableRows(analysis, total_students)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        setTimeout(() => {
            this.renderApexChart(chartId, analysis, total_students);
        }, 100);

        container.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    renderTableRows(analysis, totalStudents) {
        return analysis
            .map((item) => {
                const badgeClass =
                    item.difficulty === "Easy" ? "success" : item.difficulty === "Medium" ? "warning" : "danger";
                const percentageColor =
                    item.correct_percentage >= 70 ? "#38a169" : item.correct_percentage >= 40 ? "#ed8936" : "#f56565";

                return `
                <tr style="transition: background 0.2s;">
                    <td style="padding: 12px; text-align: center; font-weight: 700; font-size: 1rem;">${
                        item.question_number
                    }</td>
                    <td class="text-success" style="padding: 12px; text-align: center; font-weight: 700; font-size: 1rem;">${
                        item.correct_count
                    }</td>
                    <td class="text-danger" style="padding: 12px; text-align: center; font-weight: 700; font-size: 1rem;">${
                        item.wrong_count
                    }</td>
                    <td class="text-warning" style="padding: 12px; text-align: center; font-weight: 600; font-size: 0.95rem;">${
                        item.uncertain_count
                    }</td>
                    <td style="padding: 12px; text-align: center;">
                        <div style="position: relative;">
                            <strong style="font-size: 1.1rem; color: ${percentageColor};">
                                ${item.correct_percentage.toFixed(1)}%
                            </strong>
                            <div style="margin-top: 4px; background: #e2e8f0; border-radius: 4px; height: 6px; overflow: hidden;">
                                <div style="width: ${
                                    item.correct_percentage
                                }%; height: 100%; background: ${percentageColor}; transition: width 0.3s;"></div>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 12px; text-align: center;">
                        <span class="badge bg-${badgeClass}" style="font-size: 0.85rem; padding: 6px 14px;">${
                    item.difficulty
                }</span>
                    </td>
                </tr>
            `;
            })
            .join("");
    }

    renderApexChart(chartId, analysis, totalStudents) {
        const categories = [];
        const correctData = [];
        const wrongData = [];

        analysis.forEach((item) => {
            categories.push(`Q${item.question_number}`);
            correctData.push(item.correct_count);
            wrongData.push(item.wrong_count);
        });

        const options = {
            series: [
                {
                    name: "Correct Answers",
                    data: correctData,
                    color: "#38a169",
                },
                {
                    name: "Wrong Answers",
                    data: wrongData,
                    color: "#e53e3e",
                },
            ],
            chart: {
                type: "bar",
                height: 500,
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true,
                    },
                },
                animations: {
                    enabled: true,
                    easing: "easeinout",
                    speed: 800,
                },
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: "70%",
                    borderRadius: 8,
                    dataLabels: {
                        position: "top",
                    },
                },
            },
            dataLabels: {
                enabled: true,
                offsetY: -25,
                style: {
                    fontSize: "12px",
                    fontWeight: "bold",
                    colors: ["#0A3A4A"],
                },
            },
            stroke: {
                show: true,
                width: 2,
                colors: ["transparent"],
            },
            xaxis: {
                categories: categories,
                labels: {
                    style: {
                        fontSize: "13px",
                        fontWeight: 600,
                        colors: "#0A3A4A",
                    },
                },
                title: {
                    text: "Questions",
                    style: {
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#0A3A4A",
                    },
                },
            },
            yaxis: {
                max: totalStudents,
                labels: {
                    style: {
                        fontSize: "13px",
                        fontWeight: 600,
                        colors: "#0A3A4A",
                    },
                    formatter: function (val) {
                        return Math.floor(val);
                    },
                },
                title: {
                    text: "Number of Students",
                    style: {
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#0A3A4A",
                    },
                },
            },
            fill: {
                opacity: 1,
                type: "gradient",
                gradient: {
                    shade: "light",
                    type: "vertical",
                    shadeIntensity: 0.3,
                    gradientToColors: ["#48bb78", "#f56565"],
                    inverseColors: false,
                    opacityFrom: 0.95,
                    opacityTo: 0.85,
                    stops: [0, 100],
                },
            },
            tooltip: {
                shared: true,
                intersect: false,
                theme: "dark",
                style: {
                    fontSize: "13px",
                },
                y: {
                    formatter: function (val) {
                        const percentage = ((val / totalStudents) * 100).toFixed(1);
                        return `${val} students (${percentage}%)`;
                    },
                },
            },
            legend: {
                position: "top",
                horizontalAlign: "center",
                fontSize: "14px",
                fontWeight: 600,
                markers: {
                    width: 12,
                    height: 12,
                    radius: 12,
                },
            },
            title: {
                text: "Question Performance Overview",
                align: "center",
                style: {
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#0A3A4A",
                },
            },
            grid: {
                borderColor: "#e2e8f0",
                strokeDashArray: 4,
                xaxis: {
                    lines: {
                        show: true,
                    },
                },
                yaxis: {
                    lines: {
                        show: true,
                    },
                },
            },
        };

        if (this.currentChart) {
            this.currentChart.destroy();
        }

        this.currentChart = new ApexCharts(document.querySelector(`#${chartId}`), options);
        this.currentChart.render();
    }
}

window.questionAnalysis = new QuestionAnalysis();
