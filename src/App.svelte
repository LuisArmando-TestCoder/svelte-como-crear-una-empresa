<script>
  import { writable, get } from "svelte/store";
  import { onMount } from "svelte";
  import empresaData from "./empresaData";
  import ShaderToy from "./ShaderToy.svelte";
  import VShader from "./V.shader";

  let selectedEmpresaIndex = writable(0);
  let currentStep = writable(0);
  let currentSubStep = writable(0);
  let currentDetailIndex = writable(0);

  // Load from localStorage if available
  onMount(() => {
    const savedSelectedEmpresaIndex = localStorage.getItem(
      "selectedEmpresaIndex"
    );
    const savedCurrentStep = localStorage.getItem("currentStep");
    const savedCurrentSubStep = localStorage.getItem("currentSubStep");
    const savedCurrentDetailIndex = localStorage.getItem("currentDetailIndex");

    if (savedSelectedEmpresaIndex !== null)
      selectedEmpresaIndex.set(+savedSelectedEmpresaIndex);
    if (savedCurrentStep !== null) currentStep.set(+savedCurrentStep);
    if (savedCurrentSubStep !== null) currentSubStep.set(+savedCurrentSubStep);
    if (savedCurrentDetailIndex !== null)
      currentDetailIndex.set(+savedCurrentDetailIndex);
  });

  // Save to localStorage whenever value changes
  selectedEmpresaIndex.subscribe((value) => {
    localStorage.setItem("selectedEmpresaIndex", String(value));
  });
  currentStep.subscribe((value) => {
    localStorage.setItem("currentStep", String(value));
  });
  currentSubStep.subscribe((value) => {
    localStorage.setItem("currentSubStep", String(value));
  });
  currentDetailIndex.subscribe((value) => {
    localStorage.setItem("currentDetailIndex", String(value));
  });

  function nextDetail() {
    const currentDetailIndexValue = get(currentDetailIndex);
    const currentSubStepValue = get(currentSubStep);
    const currentStepValue = get(currentStep);
    const selectedEmpresaIndexValue = get(selectedEmpresaIndex);

    const empresa = empresaData.tipos[selectedEmpresaIndexValue];
    const currentPaso = empresa.pasos[currentStepValue];
    const currentSubPaso = currentPaso.subpasos[currentSubStepValue];

    if (currentDetailIndexValue < currentSubPaso.detalle.length - 1) {
      currentDetailIndex.update((n) => n + 1);
    } else if (currentSubStepValue < currentPaso.subpasos.length - 1) {
      currentSubStep.update((n) => n + 1);
      currentDetailIndex.set(0);
    } else if (currentStepValue < empresa.pasos.length - 1) {
      currentStep.update((n) => n + 1);
      currentSubStep.set(0);
      currentDetailIndex.set(0);
    }
  }

  function previousStep() {
    // Get current values
    let currentDetailIndexValue = get(currentDetailIndex);
    let currentSubStepValue = get(currentSubStep);
    let currentStepValue = get(currentStep);
    let selectedEmpresaIndexValue = get(selectedEmpresaIndex);

    if (currentDetailIndexValue > 0) {
      // Decrement detail index if possible
      currentDetailIndex.update((n) => n - 1);
    } else if (currentSubStepValue > 0) {
      // Decrement sub-step index
      const newSubStepValue = currentSubStepValue - 1;
      currentSubStep.set(newSubStepValue);

      // Access the updated sub-step
      const subpasos =
        empresaData.tipos[selectedEmpresaIndexValue].pasos[currentStepValue]
          .subpasos;
      const detalleLength = subpasos[newSubStepValue].detalle.length;

      // Set detail index to the last item of the new sub-step
      currentDetailIndex.set(detalleLength - 1);
    } else if (currentStepValue > 0) {
      // Decrement step index
      const newStepValue = currentStepValue - 1;
      currentStep.set(newStepValue);

      // Access the updated step and get the last sub-step
      const pasos = empresaData.tipos[selectedEmpresaIndexValue].pasos;
      const subpasos = pasos[newStepValue].subpasos;
      const newSubStepIndex = subpasos.length - 1;
      currentSubStep.set(newSubStepIndex);

      // Set detail index to the last item of the last sub-step
      const detalleLength = subpasos[newSubStepIndex].detalle.length;
      currentDetailIndex.set(detalleLength - 1);
    }
    // If none of the above, we're at the very beginning and do nothing
  }

  function updateSteps(selectedIndex) {
    selectedEmpresaIndex.set(selectedIndex);
    currentStep.set(0);
    currentSubStep.set(0);
    currentDetailIndex.set(0);
  }
</script>

<div class="step-container">
  <div class="empresa-selector">
    <label for="empresa-tipo">Seleccione el tipo de empresa:</label>
    <select
      id="empresa-tipo"
      on:change={(e) => updateSteps(e.target.selectedIndex)}
    >
      {#each empresaData.tipos as tipo, index}
        <option value={index}>{tipo.tipo}</option>
      {/each}
    </select>
    <p>
      {empresaData.tipos[$selectedEmpresaIndex].descripcion}
    </p>
  </div>

  <div class="step-buttons">
    <button
      on:click={previousStep}
      disabled={$currentStep === 0 &&
        $currentSubStep === 0 &&
        $currentDetailIndex === 0}>Anterior</button
    >
    <button
      on:click={nextDetail}
      disabled={$currentStep ===
        empresaData.tipos[$selectedEmpresaIndex].pasos.length - 1 &&
        $currentSubStep ===
          empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos
            .length -
            1 &&
        $currentDetailIndex ===
          empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[
            $currentSubStep
          ].detalle.length -
            1}
    >
      Siguiente
    </button>
  </div>

  {#if empresaData.tipos.length > 0}
    <div class="step-details" aria-live="polite">
      <h2>
        {empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].paso}
      </h2>
      <p>
        {empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep]
          .descripcion}
      </p>

      <div class="substeps-list">
        <strong>Subpaso Actual:</strong>
        <h3>
          {empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep]
            .subpasos[$currentSubStep].subpaso}
        </h3>

        <div class="substeps-details">
          <strong>Detalle Actual:</strong>
          <p>
            {empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep]
              .subpasos[$currentSubStep].detalle[$currentDetailIndex]}
          </p>
        </div>

        {#if empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[$currentSubStep].caveats?.length > 0}
          <div class="caveats">
            <strong>Caveats:</strong>
            <ul>
              {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[$currentSubStep].caveats as caveat}
                <li>{caveat}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <div class="document-list">
        <strong>Documentos necesarios:</strong>
        <ul>
          {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].documentos as documento}
            <li class="document-list-item">{documento}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<div class="shader">
  <ShaderToy shader={VShader} />
</div>

<style>
  .shader {
    position: fixed;
    top: 0;
    left: 0;
    z-index: -1;
  }

  .step-container {
    padding: 3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 800px;
    margin: 2rem auto;
    background-color: #ffffff;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
    border-radius: 12px;
    font-family: Arial, sans-serif;
  }

  .empresa-selector {
    margin-bottom: 2rem;
  }

  .step-details {
    width: 100%;
    margin-top: 2rem;
    padding: 2rem;
    background-color: #f9f9f9;
    border-radius: 8px;
  }

  .step-buttons {
    position: sticky;
    top: 0;
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-top: 3rem;
    gap: 1rem;
  }

  .document-list {
    margin-top: 2rem;
    font-size: 1.1rem;
    line-height: 1.6;
  }

  .document-list-item {
    margin-bottom: 1rem;
  }

  .substeps-list {
    margin-top: 2rem;
    font-size: 1.1rem;
    line-height: 1.6;
  }

  .substeps-list-item {
    margin-bottom: 1rem;
  }

  .substeps-details {
    margin-left: 2rem;
    font-size: 1rem;
    color: #555;
    line-height: 1.5;
  }

  .caveats {
    margin-top: 1rem;
    font-size: 1rem;
    color: #d9534f;
    line-height: 1.5;
  }

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    background-color: #007bff;
    color: white;
    border-radius: 6px;
    cursor: pointer;
    transition:
      background-color 0.3s,
      transform 0.2s;
  }

  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  button:hover:not(:disabled) {
    background-color: #0056b3;
    transform: translateY(-2px);
  }

  @media (max-width: 600px) {
    .step-container {
      padding: 2rem;
    }

    .step-buttons {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    button {
      margin-top: 1rem;
    }
  }
</style>
