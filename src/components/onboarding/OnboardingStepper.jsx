/**
 * OnboardingStepper.jsx
 * شريط تقدم الخطوات العلوي لمعالج التهيئة الأولى بهوية FOX.CLOUD
 */
export default function OnboardingStepper({ currentStep = 1 }) {
  const steps = [
    { number: 1, label: 'نشاطك', id: 'sector' },
    { number: 2, label: 'الإعداد الجاهز', id: 'catalog' },
    { number: 3, label: 'الإنشاء', id: 'provision' },
    { number: 4, label: 'ابدأ العمل', id: 'launch' },
  ];

  return (
    <div className="onboarding-stepper-container">
      <div className="onboarding-stepper">
        {steps.map((s, index) => {
          const isCompleted = currentStep > s.number;
          const isActive = currentStep === s.number;

          return (
            <div key={s.id} className="stepper-item-wrap">
              <div
                className={`stepper-node ${
                  isCompleted ? 'completed' : isActive ? 'active' : 'upcoming'
                }`}
              >
                <div className="stepper-circle">
                  {isCompleted ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stepper-check-icon"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span>{s.number}</span>
                  )}
                </div>
                <span className="stepper-label">{s.label}</span>
              </div>

              {index < steps.length - 1 && (
                <div
                  className={`stepper-connector ${
                    currentStep > s.number ? 'filled' : ''
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
