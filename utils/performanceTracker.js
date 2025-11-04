// Performance tracking utility
class PerformanceTracker {
    constructor() {
        this.startTime = null;
        this.steps = [];
    }

    start(label) {
        this.startTime = performance.now();
        this.steps = [];
        console.log(`\n🚀 [PERFORMANCE] Starting: ${label}`);
    }

    step(stepName) {
        const now = performance.now();
        if (this.startTime === null) {
            this.startTime = now;
        }
        
        const elapsed = now - this.startTime;
        const stepTime = this.steps.length > 0 
            ? now - this.steps[this.steps.length - 1].endTime 
            : elapsed;
        
        this.steps.push({
            name: stepName,
            elapsed: elapsed,
            stepTime: stepTime,
            endTime: now
        });
        
        console.log(`⏱️  [PERFORMANCE] ${stepName}: ${stepTime.toFixed(0)}ms (total: ${elapsed.toFixed(0)}ms)`);
        
        return now;
    }

    end() {
        const totalTime = performance.now() - this.startTime;
        console.log(`\n✅ [PERFORMANCE] Total time: ${totalTime.toFixed(0)}ms`);
        console.log(`\n📊 [PERFORMANCE] Breakdown:`);
        
        this.steps.forEach((step, index) => {
            const percentage = (step.stepTime / totalTime * 100).toFixed(1);
            console.log(`   ${index + 1}. ${step.name}: ${step.stepTime.toFixed(0)}ms (${percentage}%)`);
        });
        
        // Find slowest step
        const slowestStep = this.steps.reduce((max, step) => 
            step.stepTime > max.stepTime ? step : max, 
            this.steps[0] || { name: 'N/A', stepTime: 0 }
        );
        
        if (slowestStep.stepTime > 0) {
            console.log(`\n🐌 [PERFORMANCE] Slowest step: ${slowestStep.name} (${slowestStep.stepTime.toFixed(0)}ms)`);
        }
        
        return totalTime;
    }
}

// Export singleton instance
export const tracker = new PerformanceTracker();

