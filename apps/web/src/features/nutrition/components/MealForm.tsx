import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { range } from '@/components/ui/NumberPicker';
import { cn } from '@/lib/cn';
import { mealFormSchema, toMealDraft, type MealFormValues, type MealFormParsed } from '../schemas/meal.schema';
import { NUTRITION, NUTRITION_RANGES } from '../constants/messages';
import { useMealMutation } from '../api/useMeals';

const R = NUTRITION_RANGES;
const KCAL = range(R.kcal.min, R.kcal.max, R.kcal.step);
const GRAMS = range(R.grams.min, R.grams.max, R.grams.step);

const inputBase =
  'w-full rounded-2xl bg-sys-fill px-4 py-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-lavender';

/**
 * Manual meal entry (free-tier pillar). react-hook-form + Zod (`mealFormSchema`) —
 * the same schema the AI `logMeal` path validates against, so a hand-logged meal
 * and an AI-logged meal produce identically-valid data.
 */
export function MealForm({ date, onDone }: { date: string; onDone: () => void }) {
  const add = useMealMutation();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MealFormValues, unknown, MealFormParsed>({
    resolver: zodResolver(mealFormSchema),
    defaultValues: { name: '', calories: '', protein: '', carbs: '', fat: '' },
    mode: 'onSubmit',
  });

  // `values` is already Zod-parsed (numbers coerced) thanks to the transform schema.
  const onSubmit = handleSubmit(async (values) => {
    await add.mutateAsync(toMealDraft(values, date));
    onDone();
  });

  return (
    <Card accent="surface" className="mb-3">
      <p className="eyebrow mb-2">{NUTRITION.form.heading}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
        <input
          className={cn(inputBase, errors.name && 'ring-2 ring-(--color-crit)')}
          placeholder={NUTRITION.form.namePlaceholder}
          aria-label={NUTRITION.form.namePlaceholder}
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        {errors.name && <p className="text-crit text-xs font-semibold">{errors.name.message}</p>}

        <div className="grid grid-cols-4 gap-2">
          <Controller
            control={control}
            name="calories"
            render={({ field }) => (
              <NumberField
                className="w-full"
                value={String(field.value ?? '')}
                onChange={field.onChange}
                options={KCAL}
                title={NUTRITION.form.calories}
                unit={NUTRITION.form.kcal}
                placeholder={NUTRITION.form.kcal}
              />
            )}
          />
          <Controller
            control={control}
            name="protein"
            render={({ field }) => (
              <NumberField
                className="w-full"
                value={String(field.value ?? '')}
                onChange={field.onChange}
                options={GRAMS}
                title={NUTRITION.form.protein}
                unit={NUTRITION.form.grams}
                placeholder={NUTRITION.form.pShort}
              />
            )}
          />
          <Controller
            control={control}
            name="carbs"
            render={({ field }) => (
              <NumberField
                className="w-full"
                value={String(field.value ?? '')}
                onChange={field.onChange}
                options={GRAMS}
                title={NUTRITION.form.carbs}
                unit={NUTRITION.form.grams}
                placeholder={NUTRITION.form.cShort}
              />
            )}
          />
          <Controller
            control={control}
            name="fat"
            render={({ field }) => (
              <NumberField
                className="w-full"
                value={String(field.value ?? '')}
                onChange={field.onChange}
                options={GRAMS}
                title={NUTRITION.form.fat}
                unit={NUTRITION.form.grams}
                placeholder={NUTRITION.form.fShort}
              />
            )}
          />
        </div>
        {errors.calories && <p className="text-crit text-xs font-semibold">{errors.calories.message}</p>}

        <div className="mt-3 flex gap-2">
          <Button type="submit" variant="ink" disabled={isSubmitting || add.isPending}>
            {add.isPending ? NUTRITION.actions.adding : NUTRITION.actions.add}
          </Button>
          <Button type="button" variant="surface" onClick={onDone}>
            {NUTRITION.actions.cancel}
          </Button>
        </div>
        {add.isError && <p className="text-crit mt-1 text-xs font-semibold">{NUTRITION.errors.saveFailed}</p>}
      </form>
    </Card>
  );
}
