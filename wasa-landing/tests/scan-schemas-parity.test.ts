import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SQLMAP_LEVEL_MIN,
  SQLMAP_LEVEL_MAX,
  SQLMAP_LEVEL_DEFAULT,
  SQLMAP_RISK_MIN,
  SQLMAP_RISK_MAX,
  SQLMAP_RISK_DEFAULT,
} from '@entities/scan'
import { extractPythonFieldRange } from './support/pythonConstants'

const bridgeSchemasPath = path.resolve(__dirname, '../../fastapi_bridge/schemas/scan_schemas.py')

describe('paridad de los rangos y defaults de SQLMap con el Bridge (D-10)', () => {
  it('los límites de sqlmap_level coinciden con Field(ge=..., le=...) del Bridge', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    const backendRange = extractPythonFieldRange(source, 'sqlmap_level')

    expect(SQLMAP_LEVEL_MIN).toBe(backendRange.min)
    expect(SQLMAP_LEVEL_MAX).toBe(backendRange.max)
  })

  it('los límites de sqlmap_risk coinciden con Field(ge=..., le=...) del Bridge', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    const backendRange = extractPythonFieldRange(source, 'sqlmap_risk')

    expect(SQLMAP_RISK_MIN).toBe(backendRange.min)
    expect(SQLMAP_RISK_MAX).toBe(backendRange.max)
  })

  it('el default de sqlmap_level coincide con el del Bridge', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    const backendRange = extractPythonFieldRange(source, 'sqlmap_level')

    expect(SQLMAP_LEVEL_DEFAULT).toBe(backendRange.default)
  })

  it('el default de sqlmap_risk coincide con el del Bridge', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    const backendRange = extractPythonFieldRange(source, 'sqlmap_risk')

    expect(SQLMAP_RISK_DEFAULT).toBe(backendRange.default)
  })
})

describe('extractPythonFieldRange: modo de fallo (D-10)', () => {
  it('lanza un error que nombra el campo cuando no aparece en el texto', () => {
    const sourceWithoutField = 'other_field: Annotated[int, Field(ge=1, le=9)] = 1\n'

    expect(() => extractPythonFieldRange(sourceWithoutField, 'sqlmap_level')).toThrow(/sqlmap_level/)
  })

  it('lee un archivo del Bridge inexistente y falla al intentar leerlo, no en silencio', () => {
    const missingPath = path.resolve(__dirname, '../../fastapi_bridge/schemas/does-not-exist.py')

    expect(() => readFileSync(missingPath, 'utf-8')).toThrow()
  })
})

describe('resto del contrato de scan_schemas.py sigue vigente (D-10, R-5)', () => {
  it('phpsessid sigue declarando strip_whitespace=True y min_length=1', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    expect(source).toMatch(/phpsessid:.*StringConstraints\(strip_whitespace=True,\s*min_length=1\)/)
  })

  it('ScanRequest.model_config sigue declarando extra="ignore"', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    expect(source).toMatch(/model_config\s*=\s*ConfigDict\(extra="ignore"\)/)
  })

  it('ScanResponse.status sigue siendo Literal["queued"]', () => {
    const source = readFileSync(bridgeSchemasPath, 'utf-8')
    expect(source).toMatch(/status:\s*Literal\["queued"\]/)
  })
})
